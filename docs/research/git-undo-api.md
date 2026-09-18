# Undo last commit API

Researched and implemented September 15, 2026.

## Sources and existing infrastructure

Checked the [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and [Expo API route documentation](https://docs.expo.dev/router/web/api-routes/) against the project's Expo `~57.0.20` / Router `~57.0.19`. A mutation is exported as a POST handler using the existing `createGitRoute` factory.

The [Codaloud requirements](https://www.notion.so/3d2b3d6d3d6f809b9c82e98a68e01be1) were refreshed: local Git must work without GitHub, and routes enforce session authentication and project ownership. This change stays in the API layer.

Git reset moves the active branch to a target commit. Soft preserves index and working files; mixed resets the index and preserves working files; hard resets both and can replace obstructing untracked files. Git records the previous tip in `ORIG_HEAD`. [Git reset](https://git-scm.com/docs/git-reset)

`<commit>^1` selects its first parent, including for merges; `^{commit}` verifies commit identity. Resolving this from the captured SHA prevents a later HEAD read from selecting another target. [Git revisions](https://git-scm.com/docs/gitrevisions), [Git rev-parse](https://git-scm.com/docs/git-rev-parse)

The codebase had no undo command to reuse. The implementation reuses `createGitRoute`, `executeGitOperation`, `requestDaytona`, `createGitOperationCommand`, the repository lock, current-state capture/checks, branch/hash schemas, and disposable Git fixtures. The existing revert API remains a separate operation that creates an inverse commit.

## Contract

`POST /api/projects/:projectId/git/undo`

```json
{ "mode": "soft" }
```

The required `mode` field accepts exactly `soft`, `mixed`, or `hard`, with no default. `gitUndoModes` exports the values and `GitUndoMode` exports their union. The strict request schema rejects caller-selected branches, SHAs, parent numbers, commands, and extra fields.

Successful `data` contains:

```json
{
  "previousHeadSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "headSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "currentBranch": "feature/current",
  "mode": "soft"
}
```

The operation uses the branch checked out when the sandbox lock is acquired. It resolves that commit's first parent, checks captured state again, executes `git reset --<mode> --no-recurse-submodules <parentSha> --`, and verifies the resulting branch and HEAD. No caller-provided reset target or commit count is accepted.

## Behavior and boundaries

- Existing staged/unstaged work follows the selected mode. Soft leaves the index intact; it does not stage previously unstaged edits. Hard deliberately permits discarding dirty tracked work and replacing obstructing untracked content. Unrelated untracked files are not globally cleaned.
- A merge is undone to its first parent. A root commit returns `409 GIT_PARENT_REQUIRED`; it is not converted into an unborn branch.
- Detached/unborn state requires a checked-out branch with a commit. Shallow history is conservatively rejected with `422 GIT_HISTORY_INCOMPLETE`, consistent with the existing revert policy.
- Unfinished merge/rebase/revert operations, conflicts, unsupported repository configuration, and occupied locks retain existing errors. This route is not an abort-operation endpoint.
- Reset does not recurse into submodule working trees and does not fetch, push, or alter remote-tracking references. It may rewind a locally published commit; synchronizing rewritten history is a separate operation.
- Authentication, owned-project readiness, trusted sandbox paths, bounded JSON/output, safe errors, and cancellation come from shared infrastructure. No author identity is needed because no new commit is created.
- Execution failures after mutation starts return an unknown outcome. Requests are not automatically retried; another successful request would undo another commit.

## Verification

Tests were written before implementation. Real-Git tests cover clean and dirty state for every mode, untracked obstructions, ignored-file preservation, root/detached/unborn/shallow states, current feature branches and merge parents, unchanged remote-tracking refs, locks, interrupted operations, branch races, and lost execution results.

API tests exercise strict mode/state validation, authentication and ownership, Daytona transport forwarding, operation error status mapping, malformed results, and no retries. These are fixture/HTTP-mock checks, not live Daytona end-to-end execution.

Completed checks: 114 test files passed, with 2,360 tests passed and 81 platform-specific skips; `tsc --noEmit` passed; all 23 Expo API routes exported successfully. Diff whitespace and authored filenames were checked.
