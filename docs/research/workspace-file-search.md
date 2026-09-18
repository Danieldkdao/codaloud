# Workspace file search research

> Historical cloud implementation research. The Daytona adapters, API routes, and
> Linux test runner referenced below have been retired. See
> [Local workspace migration](local-workspace-migration.md) for the current native
> implementation and verification.

Researched September 12, 2026; Daytona search signatures reverified September 13 against current official documentation (v0.211) and installed `@daytona/sdk` `0.210.0`. The API implementation described below was added September 13. Verification runs the real sandbox helper in a disposable Linux container through a mocked Daytona HTTP transport; no live project sandbox was used. The older research sections below record the initial proposal and alternatives.

## Implemented API contract — September 13

The existing `GET /api/projects/:projectId/files` still lists direct directory children when `search` is absent. With `search`, it returns a paginated recursive search:

```http
GET /api/projects/:projectId/files?search=auth&scope=all&pageSize=10
GET /api/projects/:projectId/files?search=auth&scope=all&pageSize=10&cursor=<URL-encoded-nextCursor>
```

- `search`: required nonblank literal string, at most 256 characters. Matching is case-insensitive; meaningful leading/trailing spaces are preserved.
- `scope`: `all` (default), `title`, or `content`. Both title/content switches off/on map to `all`; a single enabled field switch maps to its field. The native Files screen uses this API for live search.
- `path`: optional workspace-relative search folder; defaults to the entire workspace. Returned paths are always workspace-relative. The native **Current folder** filter sends the browsed directory when enabled, or when all three filters are off. Otherwise the screen sends an empty path for workspace-wide search. Folder searches include descendants, and changing the effective path starts a fresh search session instead of reusing an old cursor.
- `pageSize`: 1–100, default 10. A continuation repeats the original search, scope, path and page size along with its opaque cursor.
- Missing `search` with search-only parameters, invalid inputs, and duplicate search parameters return 400.

Success uses the existing `{ error: false, message, data }` envelope. Search `data` contains `files`, `totalCount`, `nextCursor`, `searchedAt`, `expiresAt`, and `skippedContentFiles`. Each file contains `path`, `titleMatches`, `contentMatchCount`, and `contentSearched`. Counts are actual non-overlapping occurrences, rather than matching-line totals. Results merge by full path and sort with filename matches first, then by count descending within each group, then deterministic lexical path order, before paging. Filename matches keep priority even with zero content matches. Content-only searches retain count-first ordering; title-only searches use lexical path order. The UI formatter alone caps labels at `100+`.

The API invokes a bounded Node filesystem helper through Daytona's process endpoint, reusing the application's encoded command transport. This implements the earlier sandbox-helper approach using Node already required by existing file operations, rather than introducing an unverified ripgrep dependency. Node filesystem operations remain inside Daytona; Expo performs HTTP requests and response validation. This matches the [Expo API route architecture](https://docs.expo.dev/router/web/api-routes/), [EAS worker runtime constraints](https://docs.expo.dev/eas/hosting/reference/worker-runtime/), [Daytona command execution](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand), and [Node filesystem APIs](https://nodejs.org/docs/latest-v22.x/api/fs.html).

Every request authenticates the user, confirms project ownership/readiness, and validates the sandbox/project labels. Every new search (no cursor) scans saved files anew. Search responses and errors use `Cache-Control: private, no-store`. The helper uses directory descriptors and Linux procfs to anchor paths without following symlinks. User input travels as compressed environment data, never interpolated shell code.

Paginated result sets are stored outside the workspace in `.codaloud/file-search`, so independent API workers can retrieve subsequent pages. Sessions expire after two minutes; at most 20 sessions of up to 2 MiB each are retained per sandbox, with expired/oldest sessions removed when publishing another paginated session. Session filenames bind user, project, sandbox, query, scope and page size. Each session has a random signing key that authenticates its continuation offsets. No new database table, process-global cache, environment secret, or background daemon is required.

Continuations reuse stored results and check a fresh metadata fingerprint of the searched tree, including file identity, size, mtime and ctime. They do not reread workspace file contents. Detected changes return `409 SEARCH_WORKSPACE_CHANGED`; expired, evicted, or mismatched sessions return `410 SEARCH_SESSION_EXPIRED`; tampered cursors return 400. The client restarts without a cursor. Initial scans compare metadata again before publishing. These checks detect ordinary saved edits, including external processes, at request time; they do not make filesystem reads transactional or push updates to an idle phone. Opening a file still requires a fresh read.

Scope and work limits are explicit: `.git` files/directories and dependency/build directories listed in `projectFileSearchExcludedDirectories` are excluded; symlinks and special files are skipped. Other dotfiles and untracked files are included; this implementation does not interpret `.gitignore`. Content search skips binary/invalid UTF-8 files and files above the existing 1 MiB editor limit, reporting the skipped count and `contentSearched: false` on any title-only result. Scans stop with `413 SEARCH_LIMIT_EXCEEDED` if they exceed 50,000 entries, 5,000 matching files, 64 MiB of content, 8 MiB of metadata, 128 directory levels, or the eight-second scan budget. Remote execution has a separate 12-second timeout. Failed or capped scans do not return a misleading partial ranking. Exact counts/ranking apply to the supported search scope.

Verification: API tests cover authorization, existing directory behavior, query validation, cursor forwarding, error codes and cache headers. Linux helper tests cover literal/Unicode matching, counts above 100, deduplication, full-set ranking before paging, continuation without content rescanning, edits between pages, signatures, scope/owner binding, expiry/eviction, limits, unsupported content and symlink boundaries. Run `bash scripts/test-daytona-filesystem.sh src/services/daytona/tests/file-search.test.ts` for the Linux checks; no dedicated schema tests are added.

## Provider capabilities

Daytona offers both kinds of search. Exact examples from its [FileSystem documentation](https://www.daytona.io/docs/en/typescript-sdk/file-system/):

```ts
const result = await fs.searchFiles('app', '*.ts');
const matches = await fs.findFiles('app/src', 'TODO:');
```

`searchFiles` matches file/directory names using glob patterns. `findFiles` searches content and returns file, line, and content information. Installed `node_modules/@daytona/sdk/esm/FileSystem.d.ts` confirms both signatures. Neither exposes explicit result limits, pagination, exclusion policy, cancellation signals, or match ranges. The documentation does not establish sufficient semantics to promise those controls, or that content patterns are literal strings.

The installed response types are `SearchFilesResponse = { files: string[] }` and `Match = { file: string; line: number; content: string }`. There is no next-page cursor or total-count field. Do not assume each `Match` means one occurrence: counting returned matching lines is not necessarily the same as counting text occurrences within each file.

Recommendation: implement one authenticated app search endpoint that runs a bounded search within the project's Daytona directory. Keep traversal, matching, grouping, and snippet clipping inside the sandbox; return compact results. Do not recursively fetch directory listings or download every file across the network. Start without a persistent search index; benchmark representative workspaces before introducing index maintenance.

## Search contract

Recommended product behavior, rather than provider guarantees:

- Current approved UI: independent **File title** and **File content** switches. Both off or both on searches both; only one on searches that field. Filename-only searches need not scan file contents. This supersedes the earlier recommendation for separate modes.
- File title: case-insensitive basename matching, as in the current mock. Use alphabetical path ordering for title-only searches. Relative-path and fuzzy matching are possible later extensions rather than current UI promises.
- File content: literal, case-insensitive text by default. Merge results by file path so a title/content match appears once. Keep the mobile row to filename, relative directory, and content occurrence count: exact below 100, then `100+ matches found in this file`. Whenever content search is included, rank by actual content occurrence count descending before pagination, with alphabetical path ordering for ties. Title-only matches follow content matches. The display cap must not cap the internal ranking count; bounded scans must make incomplete counts and ranking explicit. This ranking is planned for the live search implementation. Line numbers and snippets may be carried internally for opening a result, without expanding the list UI. Preserve meaningful spaces; reject an empty query separately. Defer regex, replacement, semantic search, and extra filter controls.
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

## Pagination options, not a finalized previous decision

The earlier plan proposed a capped initial search, not a finalized pagination architecture. Daytona's search APIs return arrays without paging controls. Slicing those arrays into pages can reduce phone rendering and response sizes, but does not reduce the underlying search work or the full results transferred from Daytona to the app server.

If pagination is now required, paginate **grouped files**, not individual matching lines. One option is a bounded, short-lived search session: run a fresh search for the query and scope, retain its ordered grouped results, and return a cursor into that result set. Further pages reuse that specific search generation. A new query, filter change, refresh, or known workspace write starts a new generation. Session ownership, expiry, storage bounds, and expired-cursor behavior need implementation decisions. Retaining results is explicit application state; HTTP `no-store` does not remove that retention or make later pages freshly scanned.

A strict fresh scan for every page is another option, but repeatedly pays the scan cost and can produce skipped or duplicated results as the workspace changes. Stable ordering alone cannot guarantee a consistent result set across separate scans. The documented Daytona search APIs do not provide a filesystem snapshot revision or an external-change notification guarantee. A result-session cursor offers stable pagination of search output, not a transactional snapshot of file contents; opening a file still needs a fresh read. These are application tradeoffs, not Daytona pagination features.

Daytona's installed signature is `executeCommand(command, cwd?, env?, timeout?)`. Its documented timeout terminates the remote command, whereas canceling a phone request does not establish that guarantee. Beware the documentation's timeout example: it puts `5` in the third argument despite the four-argument signature. Use the signature, and verify wrapper-child termination. [Daytona Process documentation](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand).

## Request lifecycle

Proposed behavior: debounce typing approximately 300 ms, deduplicate identical active requests, abort obsolete client requests, and discard responses for older query revisions. Bound server execution independently of client cancellation. Request immediately on keyboard Search. Do not poll an idle search screen.

Fetch on entering search, changing query/mode/scope, returning to the foreground, manual refresh, and successful relevant workspace writes. Coalesce write notifications. Use fresh sandbox scans and HTTP `Cache-Control: private, no-store`; never display a previous query's results as though they matched the current input. Mark results updating after known writes. Re-read on opening a result because files may move/change after the search.

## Verification before shipping

Verify pinned ripgrep availability in new and existing sandbox images; ignored/untracked files; nested dotfiles; `.git` exclusion; literal special characters and spaces; duplicate basenames; Unicode highlights; newline paths; symlink boundaries; binary/large files; limits and oversized lines; no-results versus execution errors; rapid typing races; saves during a scan; external edits; cancellation and remote deadline behavior. Filename and content search must work without Git initialization.
