# Current-branch Git API research

Researched September 15, 2026. Findings and implementation recommendations only; no application code or API contract is changed by this document.

## Requested behavior and Expo compatibility

The API should derive its active local branch and HEAD from the authorized workspace inside the repository lock. Create-branch accepts the new `branchName`; stash creation accepts stash options such as its message, with no source branch. This means an operation acts on the branch active **when server execution acquires the lock**, which can differ from the branch previously displayed in the UI. Capturing server state preserves consistency during that operation; it does not preserve an earlier UI selection. This distinction follows from the requested execution-time behavior.

The exact [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was refreshed. Standard Expo `+api.ts` handlers can keep their existing authentication, JSON validation, and response handling; this change requires no Expo version or native-platform adjustment. [Expo API routes](https://docs.expo.dev/router/web/api-routes/)

## Capture and validate the active state

Use `symbolic-ref --quiet --no-recurse HEAD` to read the immediate symbolic branch reference. Detached HEAD returns exit status 1; other failures such as invalid repository state must not be mistaken for detached HEAD. `--no-recurse` prevents following a chain of symbolic aliases. Require a valid direct `refs/heads/...` branch for operations whose contract requires a checked-out local branch. [Git symbolic-ref](https://git-scm.com/docs/git-symbolic-ref)

Separately resolve `rev-parse --verify --quiet HEAD^{commit}` to establish that HEAD names an existing commit. Symbolic branch identity alone is insufficient: an unborn branch has a HEAD reference but no commit yet. Preserve explicit unsupported-state behavior for such mutations rather than supplying a fabricated HEAD. [Git rev-parse](https://git-scm.com/docs/git-rev-parse), [Git glossary: unborn](https://git-scm.com/docs/gitglossary#def_unborn)

Capture both once inside the existing shared lock and retain them as immutable operation state. Recheck against that captured pair immediately before publishing a mutation, and after operations expected to preserve the local tip. Do not reacquire a different current branch mid-command and silently proceed with it. Keep expected-state checks inside the sandbox runtime even when those values are removed from public request bodies. These are application recommendations; the cooperative lock cannot constrain an unrelated process that does not honor it.

## Create branch and stash

`switch -c <branchName>` creates and switches to a branch based on current HEAD when no start point is supplied. `--no-track` prevents workspace auto-setup configuration from unexpectedly assigning an upstream. Unlike `-C`, `-c` does not reset an existing branch; creation and switching are transactional. The new name is the only branch-related value needed from the caller. Internally, using the captured HEAD as an explicit start point is also compatible with this public contract. [Git switch](https://git-scm.com/docs/git-switch), [Git branch](https://git-scm.com/docs/git-branch)

`stash push` saves current working-directory and index state and restores them toward HEAD; it does not take a source branch. Continue `--include-untracked` for the established tracked/untracked scope while preserving ignored files. Pop applies a saved stash to the current workspace, so the entry's recorded branch is not a source-branch selector. Selected stash identity and conflict handling remain necessary. [Git stash](https://git-scm.com/docs/git-stash)

## Derive push and pull destinations

The current branch's upstream is defined by `branch.<name>.remote` and `branch.<name>.merge`. A local branch named `topic` can track `origin/review`; its remote branch is then `refs/heads/review`, not `refs/heads/topic`. Git supports multiple merge values, local `.` remotes, and separate push remotes, so derivation must validate configuration rather than assume every value describes one supported GitHub branch. [Git configuration](https://git-scm.com/docs/git-config)

Recommended policy for this application's verified-origin integration:

| Repository configuration | Derived operation |
| --- | --- |
| One origin upstream, `refs/heads/review` | Push and pull the captured local branch against remote `review`. |
| No upstream configured | First push explicitly publishes to the same name as the captured local branch and then records origin tracking. Pull reports that an upstream is required. |
| Missing half of the tracking pair, multiple merge values, malformed ref, unsupported remote | Return an actionable configuration error rather than guessing. |

This table is an application policy, not a claim that unrestricted Git defaults always behave this way. Read all configured merge values so multiple values cannot be silently collapsed. Continue deriving the trusted remote URL from the connected repository ID and validating workspace origin; never accept configuration as authority to send credentials elsewhere.

Git also exposes `%(upstream:remotename)` and `%(upstream:remoteref)` through `for-each-ref`; these distinguish remote name, remote branch ref, and local tracking ref. They can help reuse existing counts logic, but direct configuration validation is still useful for detecting unsupported multiple upstream definitions or incomplete mappings. [Git for-each-ref](https://git-scm.com/docs/git-for-each-ref)

Pull's default integration target is the current branch's upstream. Preserve explicit merge/rebase choices and the existing isolated fetch followed by integration. A differently named upstream should succeed; a missing fetched remote branch should fail explicitly. [Git pull](https://git-scm.com/docs/git-pull)

Push with an explicit captured-SHA-to-remote-ref refspec avoids relying on `push.default`, including its default same-name restriction, or configured multi-ref pushes. After confirmed first push, record the captured local branch's origin/upstream mapping; a metadata refresh failure must not encourage repeating a successful remote mutation. [Git push](https://git-scm.com/docs/git-push)

## Preserve distinct mutation safeguards

Removing caller-supplied local branch/HEAD does not imply removing the force-push lease. Retain `--force-with-lease=<derived remote ref>:<expected remote SHA>` to reject an unexpected remote tip; an empty expected value requires an absent remote branch. Do not fetch a fresh remote SHA just to replace the caller's lease immediately before pushing. A lease checks that derived destination's state; it is not a substitute for a UI branch-selection check. [Git push](https://git-scm.com/docs/git-push)

Keep discard's preview fingerprint: it represents approval of particular content, not an instruction selecting a source branch. The current implementation hashes branch, HEAD, index, and changed-path data, so comparing it with a newly computed snapshot still rejects a preview from another branch or older content even after separate branch/HEAD request fields are removed. This finding comes from [git-discard-command.ts](../../src/services/daytona/git-discard-command.ts).

## Verification recommendations

Verify minimal request bodies, rejection of removed source fields, capture after lock acquisition, changed local state during an operation, detached and unborn states, and newly created branches beginning at captured HEAD. Test differently named tracking branches, no-upstream first push, no-upstream pull rejection, malformed/partial/multiple tracking configuration, explicit force lease failure, unchanged discard preview success, stale discard fingerprint rejection, and preserved stash entry checks. Existing authentication, ownership, credential isolation, and unknown-outcome tests should continue passing.

## Implemented result

- `captureCurrentState()` captures branch and HEAD under the existing shared lock; `checkExpected()` compares subsequent reads against that captured pair. The public `gitExpectedStateSchema` and its fallback input handling were removed.
- Branch creation takes only `branchName`. Stash saving takes only an optional message; pop retains selected stash identity and optional index restoration.
- Fetch accepts `{}`. Revert accepts `{}` or a merge `mainline`. Discard retains the preview fingerprint, confirmation and untracked-file choice; preview state is output as `currentBranch` / `headSha`.
- Push accepts `force` and its explicit `expectedRemoteSha` lease. Pull accepts `rebase`. Both derive the current branch and its upstream; only first push falls back to the current local name on origin. Legacy source-state fields are rejected, not ignored.
- Read-only counts already follow current HEAD; stash listing/detail read the repository stash list. Existing intentional checkout and history inspection selectors remain applicable resource selections.
- Authentication, ownership checks, `requestDaytona`, credential isolation, stash cursor pagination and non-retrying mutation transport remain in place.

Verification includes feature branches with newer commits than main, branch capture under lock, a branch change before mutation, detached/unborn creation rejection, differently named upstreams, first push, missing/ambiguous upstreams, force leases, stale discard previews, and rejection of removed request fields. Tests execute real Git inside disposable repositories; live provider execution is outside these fixture checks.

## Completed verification

- Full suite: 112 test files passed; 2,290 tests passed and 81 platform-specific tests skipped.
- TypeScript: `tsc --noEmit` passed after the refactor.
- Expo API-only server export: all 22 routes exported successfully.
- Existing uncommitted formatting and configuration edits were preserved separately from these commits.
