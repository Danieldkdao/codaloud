"""Capture an immutable migration archive without changing repository contents."""
import hashlib
import json
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

root = Path(sys.argv[1])
if not root.is_dir() or root.is_symlink():
    raise RuntimeError('Expected a complete Git workspace')
has_git = (root / '.git').is_dir()
lock = root / '.git/codaloud-operation.lock' if has_git else root.parent / 'codaloud-migration.lock'
fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
archive = None

def checksum(source):
    digest = hashlib.sha256()
    for chunk in iter(lambda: source.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()

def inventory():
    entries = []
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in sorted(directories + files):
            path = Path(parent) / name
            relative = path.relative_to(root).as_posix()
            if relative == '.git/codaloud-operation.lock':
                continue
            info = path.lstat()
            entry = {'path': relative, 'mode': stat.S_IMODE(info.st_mode)}
            if stat.S_ISLNK(info.st_mode):
                entry.update(kind='symlink', target=os.readlink(path))
            elif stat.S_ISDIR(info.st_mode):
                entry.update(kind='directory')
            elif stat.S_ISREG(info.st_mode):
                with path.open('rb') as source:
                    digest = checksum(source)
                entry.update(kind='file', size=info.st_size, sha256=digest)
            else:
                raise RuntimeError('Unsupported special file; export aborted without dropping it')
            entries.append(entry)
    return sorted(entries, key=lambda item: item['path'])

try:
    before = inventory()
    handle, archive = tempfile.mkstemp(prefix='codaloud-migration-', suffix='.tar')
    os.close(handle)
    with tarfile.open(archive, 'w', dereference=False) as output:
        for entry in before:
            output.add(root / entry['path'], arcname=entry['path'], recursive=False)
    if before != inventory():
        raise RuntimeError('Workspace changed during export; retry while it is idle')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args], env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}).decode()
    with open(archive, 'rb') as source:
        digest = checksum(source)
    print(json.dumps({'archive': archive, 'sha256': digest, 'bytes': os.path.getsize(archive),
                      'entries': before, 'head': subprocess.run(['git', '-C', str(root), 'symbolic-ref', 'HEAD'], capture_output=True, text=True).stdout.strip() if has_git else None,
                      'status': git('status', '--porcelain=v1', '-z', '--untracked-files=all') if has_git else None,
                      'refs': subprocess.run(['git', '-C', str(root), 'show-ref'], capture_output=True, text=True).stdout if has_git else None}))
except BaseException:
    if archive:
        os.unlink(archive)
    raise
finally:
    os.close(fd)
    os.unlink(lock)
