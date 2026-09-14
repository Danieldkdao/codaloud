# Selected-file commits through Daytona

Researched September 14, 2026. Research only; no application implementation or sandbox mutation.

## Confirmed support and compatibility

Daytona supports the required primitives: `git.status(path)`, `git.add(path, files)`, and `git.commit(path, message, author, email, allowEmpty?)`. Staging accepts repository-relative files or directories; commit consumes staged changes and returns `{ sha }`. Pass `false` for `allowEmpty`. Commit and push are separate operations. [TypeScript Git reference](https://www.daytona.io/docs/en/typescript-sdk/git/)

The project requests `@daytona/sdk` `^0.210.0` and resolves **0.210.0** in its lockfile and installation. The installed [Git implementation](../../node_modules/@daytona/sdk/esm/Git.js) confirms those signatures and maps Toolbox's `{ hash }` response to SDK `{ sha }`. Its status model has separate staging/worktree states; the SDK does not expose an atomic selected-path commit, expected-HEAD argument, or commit idempotency key.

Codaloud already uses direct Toolbox HTTP in [branches.ts](../../src/services/daytona/branches.ts), whose comment documents SDK transitive ESM initialization failures when bundled into Expo API routes. Reuse `getSandboxGitRepository` and `requestDaytona` for the HTTP equivalents. The documented endpoints are `POST /git/add` and `POST /git/commit`. [Daytona Git operations](https://www.daytona.io/docs/en/git-operations/)

## Proposed flow

The client's mutation → action → Expo API route → Daytona service architecture fits. The [Codaloud requirements](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1), fetched by the parent research task, require local commits without GitHub, separate push, completed editor saves before Git operations, coordinated workspace writes, and retries that avoid duplicate commits.

1. Keep the selection and commit message in client state. Complete pending saves before submitting project ID, selected path identities, and message; include expected branch/HEAD and an operation ID for stale-state/retry handling. Send paths, not another copy of file contents.
2. Authenticate, load the user's ready project, and derive its sandbox and repository location server-side. Validate a trimmed nonempty message and nonempty bounded unique selection. Remote GitHub ownership is not a prerequisite for a local commit; distinguish project access from remote permissions needed by push.
3. Coordinate the operation with other workspace mutations. Re-read repository state and require **every** selected path to match an eligible current change. Reject the whole request for stale/invalid entries rather than silently committing a subset. Reject unresolved conflicts and unsupported repository states.
4. Ensure the existing index cannot contribute unselected changes, stage the validated selection, and verify that staged changes are nonempty and exactly match the intended selection. Then commit with server-resolved author identity and `allow_empty: false`.
5. Validate the returned hash and record the successful operation result before responding. Refresh changes, commit history, and branch tracking data; clear selection/message only after success. A refresh failure must not turn a successful commit into a failed commit request.

These are proposed application responsibilities, not guarantees supplied by Daytona's multi-request API.

## Three details that change the naive implementation

**Deleted files are valid selections.** Require paths to belong to the repository's current change set, not necessarily to exist on disk. Staging may record removal. For renames, use both original and current paths as appropriate so selection represents the whole rename. Git stages the contents present at staging time; later edits require another staging operation. [Git add manual](https://git-scm.com/docs/git-add)

**Commit includes the index.** Adding selected files does not remove unrelated staged files. The simplest initial policy is to reject unrelated pre-staged changes with a clear conflict response. Preserving arbitrary pre-existing staging while committing only selected files requires a more involved index strategy; do not silently reset the user's staging. [Git commit manual](https://git-scm.com/docs/git-commit)

**Path identities must remain literal.** Reuse [projectChangePathSchema](../../src/features/projects/actions/change-schemas.ts) and exact server-side change membership; do not normalize away meaningful filename characters. The existing [changes command](../../src/services/daytona/changes-command.ts) handles repository boundaries, original paths, symlinks, submodules, and literal Git pathspecs. Daytona's public add contract does not establish equivalent literal-path behavior. Directory/glob expansion must never add files outside the selection. [Git pathspec documentation](https://git-scm.com/docs/gitglossary#Documentation/gitglossary.txt-aiddefpathspecapathspec)

## HTTP illustration

This is only the final service step after authorization, save completion, selection validation, index checks, and coordination. It is not a complete safe route.

```ts
await requestDaytona(`${toolboxUrl}/git/add`, {
  method: "POST",
  body: JSON.stringify({ path: repositoryPath, files: validatedPaths }),
});

// Re-read and verify the staged set here before committing.
const response = await requestDaytona(`${toolboxUrl}/git/commit`, {
  method: "POST",
  body: JSON.stringify({
    path: repositoryPath,
    message,
    author: commitIdentity.name,
    email: commitIdentity.email,
    allow_empty: false,
  }),
});

const { hash } = z.object({ hash: commitHashSchema }).parse(response);
return { sha: hash };
```

Request fields follow the [official HTTP examples](https://www.daytona.io/docs/en/git-operations/#commit-changes); the installed [Toolbox commit response](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/git-commit-response.d.ts) verifies `hash`. Reuse the existing [commitHashSchema](../../src/features/projects/actions/commit-schemas.ts).

## Verify during implementation

The documentation and installed client contracts confirm API availability. They do not prove deployed Toolbox behavior. Verify selected deletion/rename staging, literal filenames (including wildcard characters and leading hyphens), staged-plus-unstaged edits, unrelated staged changes, empty/unborn repositories, and nonempty author identity. If the built-in staging endpoint cannot meet exact-selection semantics, keep Daytona for execution and use the project's existing structured Git command approach for that step.

Also verify concurrent save/checkout/commit behavior, stage-success/commit-failure recovery, and a lost response after a successful commit. Separate API calls are not a transaction. An operation ID requires durable result lookup and reconciliation of uncertain completion; it is not enough to disable the button or blindly retry a timed-out commit.

No tests were written or run, and no app or sandbox was started. The only added file is this kebab-case research note. Suggested review order: confirmed contracts → proposed flow → selection/index details → HTTP illustration → runtime verification cases.
