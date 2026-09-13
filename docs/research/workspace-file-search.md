# Workspace file search research

Researched September 12, 2026. Planning only; no application changes or sandbox commands were run. Installed `@daytona/sdk` is `0.210.0`. The remote workspace's ripgrep installation/version has not been verified.

## Provider capabilities

Daytona offers both kinds of search. Exact examples from its [FileSystem documentation](https://www.daytona.io/docs/en/typescript-sdk/file-system/):

```ts
const result = await fs.searchFiles('app', '*.ts');
const matches = await fs.findFiles('app/src', 'TODO:');
```

`searchFiles` matches file/directory names using glob patterns. `findFiles` searches content and returns file, line, and content information. Installed `node_modules/@daytona/sdk/esm/FileSystem.d.ts` confirms both signatures. Neither exposes explicit result limits, pagination, exclusion policy, cancellation signals, or match ranges. The documentation does not establish sufficient semantics to promise those controls, or that content patterns are literal strings.

Recommendation: implement one authenticated app search endpoint that runs a bounded search within the project's Daytona directory. Keep traversal, matching, grouping, and snippet clipping inside the sandbox; return compact results. Do not recursively fetch directory listings or download every file across the network. Start without a persistent search index; benchmark representative workspaces before introducing index maintenance.

## Search contract

Recommended product behavior, rather than provider guarantees:

- Separate **Files** and **In files** modes. Run only the selected mode; filename searches need not scan file contents.
- Files: match the basename and relative path, case-insensitively. Rank exact basename, basename prefix, basename substring, then path matches, with stable path ordering. Fuzzy matching can follow after validating basic retrieval.
- In files: literal text by default, with an explicit case-sensitive option. Return grouped file results with matching line numbers and small snippets. Preserve meaningful spaces; reject an empty query separately. Defer regex, replacement, and semantic search.
- Search saved workspace state. Flush relevant pending app saves before searching and surface save failures. A read can race external modifications; do not claim transactional snapshot consistency.

## Sandbox primitives

The following are proposed commands composed from documented flags, not verbatim documentation examples:

```sh
rg --files --null --hidden --no-follow --no-config --glob '!.git' .
rg --json --fixed-strings --line-number --ignore-case --hidden \
  --no-follow --no-config --glob '!.git' --max-filesize 1M \
  --max-count 20 -- 'search text' .
```

`--files` enumerates paths without searching contents; NUL separation handles embedded newlines. The wrapper filters and ranks these paths. Content JSON provides match events. Hidden paths require explicit inclusion; `.git` needs separate exclusion. Ignore rules remain active, and symlink traversal is disabled. `--max-count` limits matching **lines per file**, not total results. `--max-columns` does not clip JSON output. [Official ripgrep flag definitions](https://github.com/BurntSushi/ripgrep/blob/master/crates/core/flags/defs.rs).

Ripgrep normally filters ignored files and avoids binary content. This is a search scope, not a promise to search every byte. Filename enumeration can still list binary assets because it does not inspect their content. [Official ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md).

The JSON protocol represents invalid UTF-8 data as base64. Match offsets are byte offsets, not JavaScript UTF-16 positions. Convert offsets before highlighting or editor navigation, and handle unsupported paths/encodings explicitly rather than silently corrupting them. [Ripgrep JSON protocol](https://docs.rs/grep-printer/latest/grep_printer/struct.JSON.html).

## Bound work and make partial results explicit

Proposed starting limits: 100 returned files, 200 returned matching lines across the workspace, 20 matching lines per file, 1 MiB per content-searched file, a short execution deadline, and a bounded serialized response. These are app policy values to tune through measurement.

The sandbox wrapper must stream and consume output with total-byte/record limits, clip snippets before transport, and terminate its search child when a global cap or deadline is reached. A per-file limit alone does not bound total output. Handle oversized single JSON records and stderr as well. Return `truncated`/`incomplete` and reasons, never pretend a capped scan has an exact total or globally best ranking. A deadline/error is different from a complete zero-result search. Avoid naive offset pagination over a changing workspace; initially prompt users to narrow their search when limits are reached.

Use trusted workspace root resolution and existing path validation. Keep user text out of shell interpolation: send encoded validated input to a fixed wrapper and spawn ripgrep with an argument array. Include explicit application exclusions for dependency/build/cache directories, with a disclosed policy; decide separately whether to let users include ignored files. Dotfiles and ignored files are different concepts.

Daytona's installed signature is `executeCommand(command, cwd?, env?, timeout?)`. Its documented timeout terminates the remote command, whereas canceling a phone request does not establish that guarantee. Beware the documentation's timeout example: it puts `5` in the third argument despite the four-argument signature. Use the signature, and verify wrapper-child termination. [Daytona Process documentation](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand).

## Request lifecycle

Proposed behavior: debounce typing approximately 300 ms, deduplicate identical active requests, abort obsolete client requests, and discard responses for older query revisions. Bound server execution independently of client cancellation. Request immediately on keyboard Search. Do not poll an idle search screen.

Fetch on entering search, changing query/mode/scope, returning to the foreground, manual refresh, and successful relevant workspace writes. Coalesce write notifications. Use fresh sandbox scans and HTTP `Cache-Control: private, no-store`; never display a previous query's results as though they matched the current input. Mark results updating after known writes. Re-read on opening a result because files may move/change after the search.

## Verification before shipping

Verify pinned ripgrep availability in new and existing sandbox images; ignored/untracked files; nested dotfiles; `.git` exclusion; literal special characters and spaces; duplicate basenames; Unicode highlights; newline paths; symlink boundaries; binary/large files; limits and oversized lines; no-results versus execution errors; rapid typing races; saves during a scan; external edits; cancellation and remote deadline behavior. Filename and content search must work without Git initialization.
