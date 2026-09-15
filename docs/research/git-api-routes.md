# Git operation API routes

Researched September 15, 2026. This note records the implementation basis for push, pull, fetch, stash, discard, revert, branch creation, and incoming/outgoing counts. Scope is server API routes for the existing iOS/Android app; client actions, hooks, and UI wiring are separate work.

## Versions and existing integration

The project declares Expo `~57.0.20`, Expo Router `~57.0.19`, and Daytona SDK `^0.210.0`; the installed Daytona package is `0.210.0`. The exact [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was checked. Expo API routes export named HTTP methods from `+api.ts` files and use standard `Request`/`Response` objects. Dynamic route parameters arrive in the second argument. Preserve the existing server export configuration; these server endpoints also serve native apps. [Expo API routes](https://docs.expo.dev/router/web/api-routes/)

Daytona exposes command execution with a working directory, environment, and timeout in seconds; the response includes exit status and output. Installed [Process.js](../../node_modules/@daytona/sdk/esm/Process.js) confirms the request uses `command`, `cwd`, `envs`, and `timeout`, and pads the HTTP deadline beyond the command deadline. Route services should continue calling `requestDaytona` with `/process/execute` rather than importing the SDK into Expo handlers. [Daytona Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/)

Reuse the following code, inspected before designing new helpers:

| Existing code | Responsibility to preserve |
| --- | --- |
| [checkout API](../../src/app/api/projects/[projectId]/checkout+api.ts), [commits API](../../src/app/api/projects/[projectId]/commits+api.ts) | Session-first authentication, project ID validation, JSON media type and strict input validation, typed response envelope, private/no-store, cookie variance, restoration retry guidance. |
| [project-workspace.ts](../../src/features/projects/server/project-workspace.ts) | Load a ready project belonging to the authenticated user. |
| [api.ts](../../src/services/daytona/api.ts), [branches.ts](../../src/services/daytona/branches.ts) | Daytona authorization, sandbox project labels/readiness, validated Toolbox URL, server-derived repository path. |
| [GitHub access](../../src/services/github/server/access.ts), [repositories](../../src/services/github/server/repositories.ts) | Resolve current credentials and verify the connected repository by its stored ID. |
| [create-command.ts](../../src/services/daytona/create-command.ts) | Encode command input as data in bounded compressed environment chunks; escape only the static Node script. |
| [fetch-branch-command.ts](../../src/services/daytona/fetch-branch-command.ts) | Isolate authenticated network Git in a temporary bare repository, import objects without credentials, then update explicit refs. |
| [branch-schemas.ts](../../src/features/projects/actions/branch-schemas.ts) | Existing strict branch-name validation, including rejection of options and revision shorthand. |
| [commit-changes.ts](../../src/services/daytona/commit-changes.ts), [commit-changes-command.ts](../../src/services/daytona/commit-changes-command.ts) | Server-resolved commit identity, repository checks, safe Git environment, actionable failures, uncertain mutation outcomes. |

The installed SDK already provides basic Git operations; custom adapters compose the Git executable for missing options and consistent API semantics. This implements transport, authorization, and result handling rather than reimplementing Git algorithms. [Daytona Git operations](https://www.daytona.io/docs/en/git-operations/)

## Operation semantics

### Push and force push

One push handler accepts a real boolean `force`, defaulting to false. Resolve one explicit local branch and one explicit `refs/heads/...` destination; avoid configured push mappings, mirror mode, tag following, and arbitrary remote URLs. Normal push must retain fast-forward protection. For `force=true`, prefer `--force-with-lease=<destination>:<expected SHA>`: it allows rewriting only the remote state the caller observed. An empty expected value requires the remote branch to be absent. Do not refresh that expected value just before pushing: doing so defeats protection against unseen remote changes. Git documents implicit leases as vulnerable to background fetches and unrestricted force as capable of losing remote commits. Report a lease rejection as a conflict, not success. [Git push](https://git-scm.com/docs/git-push)

A successful remote push must not become an ordinary retryable failure solely because a subsequent local tracking update or count refresh failed. Network loss after sending a push means its outcome may be unknown; ask consumers to refresh before retrying. This is an application contract, consistent with the existing commit/checkout adapters.

### Pull and pull with rebase

One pull handler accepts boolean `rebase`, defaulting to false. Pull means fetching remote history followed by integrating it into the checked-out branch. Explicit merge mode corresponds to `--no-rebase`; explicit rebase mode corresponds to `--rebase`. Fetch and integration can be separate commands to retain the existing credential isolation. Require a supported checked-out branch and clean tracked/index state before integration; report existing operations and conflicts explicitly. Merge/rebase conflicts are real repository states and require resolution or an abort, not blind retries. [Git pull](https://git-scm.com/docs/git-pull)

For deterministic rebases, disable automatic stash, automatic squash, and updates to unrelated refs. Rebase's `--no-update-refs` overrides configured automatic branch updates; `--no-autostash` prevents hidden stash restoration conflicts. Do not enable interactive execution. Preserve or abort conflicts deliberately and describe the chosen behavior in the API response. [Git rebase](https://git-scm.com/docs/git-rebase)

### Fetch

Fetch updates remote-tracking refs and object history without changing local branch tips or working files. Use explicit origin branch refspecs, no submodule recursion, and no implicit tag/prune behavior unless the API promises it. Full-origin fetch should not inherit a single-branch clone's limited fetch mapping. Atomic ref publication prevents a partial tracking-ref update when possible. `--unshallow` removes shallow restrictions when the source is complete; fetching full objects alone does not establish that a shallow workspace's ancestry traversal is complete. [Git fetch](https://git-scm.com/docs/git-fetch)

The existing clone helper does not request a depth, but workspaces can still contain shallow history. Detect that state rather than assuming all repositories are complete. This follows inspection of [clone-github-repository.ts](../../src/services/daytona/clone-github-repository.ts).

### Stash all, pop, and view

For the UI's “Stash All”, recommended scope is staged/unstaged tracked changes and untracked files using `stash push --include-untracked`; ignored files remain. Git's `--all` also stashes and cleans ignored files, which could include dependencies and environment files. A clean repository produces a successful no-op. Pop applies a selected stash and removes it only on success; conflicts retain the entry and may leave partially applied work. Decide explicitly whether to use `--index` to restore staging. View needs both bounded stash listing and selected-entry contents: `stash list` supports log formatting, and `stash show --patch --include-untracked` shows stored changes. Bind selection to the stash commit hash to detect reflog-index movement before mutation. [Git stash](https://git-scm.com/docs/git-stash)

#### Stash message search research

Git's stash listing delegates to `log -g --first-parent`, so it supports reflog message filtering without loading all entries into the API server. [Git 2.55 stash source](https://github.com/git/git/blob/v2.55.0/builtin/stash.c#L893-L914)

Recommended argument sequence, with validated values passed as individual process arguments:

```text
stash list --fixed-strings --regexp-ignore-case --grep-reflog=<search>
  --skip=<offset> --max-count=<pageSize+1>
  --format=%gd%x00%H%x00%gs%x00%aI -z
```

`--grep-reflog` searches the reflog subject displayed by `%gs`; `--grep` searches commit messages instead. Fixed strings give literal substring matching, including punctuation; ignore-case enables case-insensitive matching. `%gd` returns the actual shortened reflog selector, such as `stash@{4}`. Parse that index rather than deriving it from the filtered row position. Avoid `--date`, which can make selectors use timestamps. [Git log](https://git-scm.com/docs/git-log)

Filtering occurs before skip/count: Git's revision walker rejects message mismatches before returning entries to the skip/count logic. Thus pagination offsets count matching entries; retain `offset + pageSize` for continuation when the extra matching entry exists. [Git 2.55 revision source](https://github.com/git/git/blob/v2.55.0/revision.c#L3870-L4305)

A temporary Git 2.55.0 repository verified literal case-insensitive search for `alpha [draft]`: skipping one matching entry returned real indices `2` and `4`, despite intervening nonmatches. The temporary repository was removed afterward. Keep search out of detail lookup, omit filtering for empty normalized search, and retain SHA checks because stash mutations can shift indices between requests. These are application recommendations, not a snapshot-pagination guarantee from Git.

### Discard changes

Restore both index and tracked worktree from the expected HEAD using `restore --source=HEAD --staged --worktree`; this does not move branch history. Newly added paths absent from the source are removed. An unborn branch has no HEAD and needs explicit behavior, such as an empty-tree source or a clear unsupported-state response. [Git restore](https://git-scm.com/docs/git-restore)

If discard includes untracked files, `clean -fd` removes them and untracked directories while preserving ignored paths. Do not use `-x` or double force; the latter permits deleting nested repositories. Check unsupported nested/submodule states before destructive work. Document the operation's scope and require stale-state protection so it does not discard a different workspace state than the caller selected. [Git clean](https://git-scm.com/docs/git-clean)

### Revert last commit

Revert records an inverse commit and preserves existing history; it is not a reset. Require clean tracked/index state, the expected HEAD, and a server-resolved author identity. Use noninteractive message handling. A merge commit requires an explicit mainline parent; reject that state unless the API exposes a deliberate mainline choice. Reverting a root commit is valid; an empty/unborn repository has nothing to revert. Conflicts and existing sequencer operations require actionable responses. [Git revert](https://git-scm.com/docs/git-revert)

### Create branch

Create from the expected current commit and check it out using `switch -c`, unless the API deliberately specifies creation without checkout. The create-and-switch form is transactional: failed switching does not leave a newly created branch. Do not use `-C`, which can reset an existing branch. [Git switch](https://git-scm.com/docs/git-switch)

Reuse the existing branch schema and validate with Git as well. `check-ref-format --branch` accepts previous-checkout shorthand by expanding it, so schema validation must reject that syntax before execution. Avoid accepting arbitrary revision expressions, option-like names, or remote destinations. [Git check-ref-format](https://git-scm.com/docs/git-check-ref-format)

### Incoming and outgoing commit counts

Use `rev-list --left-right --count HEAD...<upstream>`: left is outgoing and right is incoming. This counts commit reachability rather than file changes or patch equivalence; do not add `--cherry-pick`. A ref snapshot and its SHAs should accompany the result so downstream operations know what was counted. A branch with no upstream, an unborn branch, or incomplete shallow history needs an explicit unavailable state rather than fabricated zero counts. A read-only endpoint reports the last fetched tracking state; remote freshness requires fetch. [Git rev-list](https://git-scm.com/docs/git-rev-list)

## Command and credential boundary

Repository configuration can run credential helpers and hooks, rewrite network URLs, and change HTTP behavior. Restrict protocol access, disable hooks/helpers and redirect following, and pin the trusted GitHub URL obtained from repository-ID verification. A temporary isolated bare repository prevents workspace configuration from seeing network credentials. Never persist credentials in origin URLs or expose provider output. [Git configuration](https://git-scm.com/docs/git-config)

Clear inherited `GIT_*` variables, then set controlled environment values; disable terminal prompts and system/global configuration. Command input chunks carrying credentials must also be removed from the environment of credential-free subprocesses. Pass arguments through `execFileSync`, not concatenated shell commands. [Git environment variables](https://git-scm.com/docs/git)

Beyond hooks, content filters and custom merge drivers can execute configured programs. Commands that read/write working files must reject or isolate unsupported custom execution configuration, or explicitly control those paths; disabling hooks alone does not disable filters. [Git attributes](https://git-scm.com/docs/gitattributes)

Repository paths, symlinked metadata, alternate object stores, in-progress operations, and concurrent changes need the same boundary checks as the existing commit command. Treat mutation timeout, abort, malformed provider response, and output truncation after mutation starts as potentially unknown outcomes. These are implementation requirements inferred from the inspected adapters and multi-step Git behavior, not atomicity guarantees from Daytona.

## Verification plan

Write route/command tests before implementation; do not create dedicated schema tests. For each route verify authentication and ownership precede provider access, strict request rejection, response privacy headers, restored/unavailable workspace handling, translated errors, and malformed/timeout provider responses. Test command builders against temporary real Git repositories and local bare remotes, with network execution mocked at the transport boundary where required.

Exercise ordinary push, rejected non-fast-forward push, explicit force lease success/rejection, first push; fast-forward/divergent pull and rebase/conflicts; fetch without worktree mutation; stash tracked/untracked/ignored files, no-op, pop conflict and stale entry, bounded list/detail; discard preserving ignored/nested repositories; root/ordinary/merge revert; duplicate/invalid/stale branch creation; equal/ahead/behind/divergent/missing-upstream/shallow counts. Include malicious configuration and command-input cases. Run TypeScript and applicable existing tests after each coherent route chunk, then commit that route before starting the next. No application runtime or live user repository mutations are needed for these tests.

## Implemented API contract

Base path: `/api/projects/:projectId/git`. These routes use the existing authenticated session and project ownership/readiness checks. Responses retain `{ error, message, data? }` on success and `{ error: true, code, message }` on failure, with `Cache-Control: private, no-store` and `Vary: Cookie`. Restoration responses include `Retry-After: 3`.

All POST requests require `Content-Type: application/json`, a body of at most 64 KiB, and no query parameters or unknown body fields. Booleans must be JSON booleans, not strings. All mutations require `expectedBranch` and `expectedHeadSha` from the last observed workspace state. They operate on initialized repositories with an existing commit. Creating a repository and initializing Git remain separate operations.

| Method and endpoint | Additional request fields | Result and behavior |
| --- | --- | --- |
| `GET /counts` | None | `currentBranch`, `headSha`, `upstream`, `upstreamSha`, `outgoing`, `incoming`, `isShallow`, `observedAt`. Counts use local tracking refs, not a network request. Missing upstream/head or shallow history yields null counts. |
| `POST /branches` | `branchName` | Creates from the expected current commit and checks out the branch; returns previous/current branch and HEAD. Never resets an existing branch. |
| `GET /stash` | Query `search` (optional), `offset` (default 0), `pageSize` (default 20, maximum 100) | Returns `stashes`, `nextOffset`, and `patch: null`. Search matches the displayed stash message using Git's case-insensitive literal matching, before pagination. Entries retain their real zero-based stash `index`, `sha`, `message`, and `createdAt`. Offset is bounded to 10,000. |
| `GET /stash` (detail) | Query `index` and `stashSha` together | Verifies the selected slot still has that SHA, then returns its entry and patch, including untracked files. Patches are bounded to 3 MiB. Nonempty `search` cannot be combined with detail lookup. |
| `POST /stash` | Optional `message` (1–5,000 trimmed characters) | Saves tracked/staged/untracked work, preserving ignored files. Returns `created`, `stashSha`, and `remainingChanges`. A clean workspace is a successful no-op. If Git reuses an identical saved commit without adding an entry, `created` is false and `stashSha` identifies the saved work. Uses the account's name/email. A restored ignore rule can make a preserved file newly untracked, which is reported through `remainingChanges`. |
| `POST /stash-pop` | `stashIndex`, `stashSha`, optional `restoreIndex` (default false) | Applies the verified stash by immutable SHA, rechecks its reflog slot, and removes it only after success. Requires a clean workspace. Returns `stashSha` and `dropped: true`. Conflicts retain the stash. |
| `GET /discard` | None | Returns `expectedBranch`, `expectedHeadSha`, `fingerprint`, and `changedPaths` for review. The token includes the index and changed file contents/modes, not just filenames. Preview is limited to 10,000 paths and 64 MiB of changed regular-file content. |
| `POST /discard` | `fingerprint`, `confirm: true`, `includeUntracked` (required boolean) | Verifies the preview, restores tracked/index content from expected HEAD, and optionally cleans only previously identified untracked paths. Preserves ignored files and nested repositories; does not move HEAD. Returns `headSha` and `remainingChanges`. Submodule repositories are rejected for discard. |
| `POST /revert` | Optional `mainline` for merge commits | Creates an inverse commit using the account's name/email. Requires clean work and complete history. Merge commits require an explicit valid parent number. Returns the new `hash`, `parentHash`, and `currentBranch`. |
| `POST /fetch` | No additional fields | Fetches all origin branches through isolated authenticated transport, atomically refreshes/prunes origin-tracking refs, and attempts to unshallow from complete remote history. Leaves local branch tips and working files intact. Returns refreshed counts. |
| `POST /push` | `remoteBranch`, optional `force` (default false), `expectedRemoteSha` required when force is true | Pushes one explicit ref. Force uses an explicit SHA lease; null means the remote branch must be absent. Returns `pushed`, `remoteBranch`, `remoteSha`, `trackingUpdated`, and `counts`. First push records the branch's upstream. A confirmed push remains successful if local metadata refresh fails (`trackingUpdated: false`, `counts: null`). |
| `POST /pull` | `remoteBranch`, optional `rebase` (default false) | Fetches then explicitly merges with the ort strategy or rebases local commits. Requires clean work and a valid account identity. Rebase disables autostash, autosquash, unrelated-ref updates, and merge recreation. Returns `previousHeadSha`, `headSha`, `currentBranch`, `rebased`, and refreshed `counts` (null if the post-success count read fails). |

For push/pull, `remoteBranch` must agree with an existing configured origin upstream. Remote access is verified using the project's stored GitHub repository ID; callers cannot supply a URL, token, sandbox ID, or repository filesystem path. Push additionally checks write permission and archived status. Local operations do not request GitHub credentials.

### Examples

Search saved stash messages with `GET /api/projects/:projectId/git/stash?search=login&offset=0&pageSize=20`. Search is trimmed and limited to 200 characters; omitted or blank search lists all stashes. Newlines and NUL inside a search are rejected. Regex characters are literal. Matching uses the full displayed message, including Git's branch prefix, rather than file names or patch contents.

Use the returned `nextOffset` with the same search for the next page; `null` means there are no more matches. Offsets count matching entries, while each entry's `index` remains its actual stash slot for detail/pop requests. Restart at offset 0 when changing search. Offset pagination reflects the current stash list on each request, so refresh from the first page after a stash is added or removed.

Push the branch whose state the caller last observed:

```json
{
  "expectedBranch": "main",
  "expectedHeadSha": "<40-or-64-character-commit-sha>",
  "remoteBranch": "main",
  "force": false
}
```

To force push, set `force` to true and include `expectedRemoteSha` from the reviewed remote-tracking state. Fetch first if a current remote snapshot is needed, but do not replace a user's reviewed lease automatically after a rejection. Pull uses the same expected branch/HEAD and remote branch fields, with `rebase: true` to select rebase.

For discard, first call `GET /discard`. POST only its `expectedBranch`, `expectedHeadSha`, and `fingerprint`, plus `confirm: true` and an explicit `includeUntracked` choice; `changedPaths` is preview output, not an accepted mutation field.

### Coordination and recovery

The shared repository lock now covers the new routes, existing staging/committing, existing remote-branch fetch and checkout, and application file creation/rename/deletion/save. Existing checkout still uses `requestDaytona` and its established error translator, with Git execution moved under the shared command lock. Native Git locks, expected revisions, immutable stash identities, and the discard fingerprint provide additional checks. Commands invoked outside these application adapters must honor the shared lock to participate in this coordination.

- `GIT_CONFLICTS` (409) means Git left conflicting/partially applied work. Refresh changes, resolve the conflict, and finish or abort the corresponding merge/rebase/revert. For stash pop, the stash is retained. These routes do not supply a conflict editor or continue/abort endpoints.
- `WORKSPACE_CHANGED` / `GIT_STASH_CHANGED` (409) require a fresh workspace/stash selection. A stash-state change detected after application can mean the stash was applied but retained; refresh both the stash list and working changes before retrying.
- `GIT_REMOTE_REJECTED` (409) covers explicit push rejection, including stale leases and branch protection. Do not silently escalate to an unrestricted force push.
- `GIT_OUTCOME_UNKNOWN` (502) means a mutation may have completed or partially succeeded. Refresh remote refs, history, status, and/or stashes as appropriate before deciding whether to retry. Adapters never automatically repeat mutating commands.
- `GIT_BUSY` (409), or the established commit/save/checkout busy code, means another application operation or native Git lock is present. The lock is released on normal completion and handled errors. A forcibly killed process can leave a lock file; do not automatically steal it. Recovery requires confirming the owning operation has stopped before removing its abandoned lock.
- `GIT_UNSUPPORTED_CONFIG` (422) rejects linked/sparse/alternate-object configurations and executable custom filters/merge drivers rather than running workspace-provided programs. `GIT_HISTORY_INCOMPLETE` requires complete history for operations that depend on ancestry.

Commands have an 80-second Git deadline, a 90-second Daytona process timeout, and a 95-second HTTP timeout. These are bounded synchronous APIs, not durable background jobs. Aborting an HTTP request does not prove the sandbox or remote mutation was cancelled. Large/long-running work can produce an unknown outcome and needs reconciliation; deployment request limits must accommodate the route deadlines.

### Verification performed

Tests exercise the actual command strings against disposable Git workspaces and bare remotes, replacing only the authenticated network transport. Route tests exercise authentication, ownership ordering, input limits, strict flags, permission failures, response validation, and uncertain outcomes. Additional regression tests cover existing checkout behavior and Git/file-write coordination. Live GitHub and Daytona execution are not part of these fixture tests. TypeScript and the Expo API-only server export are checked separately. Platform-specific Linux filesystem tests retain their existing conditional execution requirements.
