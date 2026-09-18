"""Validate every archive entry before making a portable local Git worktree."""
import configparser
import hashlib
import json
import os
import stat
import sys
import tarfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

archive, manifest_path, destination = map(Path, sys.argv[1:])
destination = destination.resolve()
manifest = json.loads(manifest_path.read_text())
with archive.open('rb') as source:
    if hashlib.file_digest(source, 'sha256').hexdigest() != manifest['sha256']:
        raise RuntimeError('Archive checksum mismatch')
if destination.exists():
    raise RuntimeError('Refusing to overwrite an existing workspace')
destination.mkdir(mode=0o700)
expected = {entry['path']: entry for entry in manifest['entries']}
with tarfile.open(archive, 'r') as source:
    members = source.getmembers()
    if len(members) != len(expected) or {member.name for member in members} != set(expected):
        raise RuntimeError('Archive entry inventory mismatch')
    # Directories precede descendants. Symlinks are created last, so extraction
    # cannot follow a link supplied by another archive member.
    for member in sorted(members, key=lambda item: (item.issym(), len(PurePosixPath(item.name).parts), item.name)):
        path = PurePosixPath(member.name)
        if path.is_absolute() or any(part in ('', '.', '..') for part in path.parts) or '\\' in member.name:
            raise RuntimeError('Unsafe archive path')
        target = destination / member.name
        if any(parent.is_symlink() for parent in target.parents):
            raise RuntimeError('Archive path traverses a symbolic link')
        if member.isdir():
            target.mkdir(exist_ok=True)
        elif member.issym():
            if path.parts[0] == '.git':
                raise RuntimeError('Git metadata cannot contain symbolic links')
            target.symlink_to(member.linkname)
        elif member.isfile() or member.islnk():
            data = source.extractfile(member)
            if data is None:
                raise RuntimeError('Missing file payload')
            with target.open('xb') as output:
                while chunk := data.read(1024 * 1024):
                    output.write(chunk)
        else:
            raise RuntimeError('Unsupported archive entry')
        if not member.issym() and not member.isdir():
            target.chmod(expected[member.name]['mode'])
for path, entry in expected.items():
    target = destination / path
    if entry['kind'] == 'file':
        with target.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        if target.stat().st_size != entry['size'] or digest != entry['sha256']:
            raise RuntimeError('Extracted file checksum mismatch')
    elif entry['kind'] == 'symlink' and os.readlink(target) != entry['target']:
        raise RuntimeError('Symbolic link mismatch')
for path, entry in sorted(expected.items(), key=lambda item: len(PurePosixPath(item[0]).parts), reverse=True):
    if entry['kind'] == 'directory':
        (destination / path).chmod(entry['mode'])
if (destination / '.git').is_file():
    raise RuntimeError('Linked Git worktrees require their external Git directory')
for path in ['objects/info/alternates', 'commondir']:
    if (destination / '.git' / path).exists():
        raise RuntimeError('Git object storage depends on an external directory')
config_path = destination / '.git/config'
if config_path.exists():
    original = configparser.RawConfigParser(strict=False)
    original.read(config_path)
    portable = configparser.RawConfigParser()
    # Keep repository settings; omit absolute worktree paths, credentials,
    # include directives, and command/filter configuration from the old host.
    for section in original.sections():
        if section == 'core':
            portable[section] = {key: value for key, value in original[section].items() if key in ['repositoryformatversion', 'filemode', 'bare', 'logallrefupdates', 'ignorecase', 'precomposeunicode', 'symlinks']}
        elif section.startswith('remote "'):
            url = original[section].get('url', '')
            parsed = urlsplit(url)
            if parsed.scheme == 'https' and parsed.hostname == 'github.com' and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment:
                portable[section] = {key: value for key, value in original[section].items() if key in ['url', 'fetch']}
        elif section.startswith('branch "'):
            portable[section] = {key: value for key, value in original[section].items() if key in ['remote', 'merge']}
    with config_path.open('w') as output:
        portable.write(output)
print(json.dumps({'entriesVerified': len(expected), 'configSanitized': config_path.exists()}))
