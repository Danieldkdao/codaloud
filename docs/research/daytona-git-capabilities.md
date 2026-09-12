# Daytona Git capabilities and Codaloud integration boundary

Researched September 11, 2026. This is an architecture research note; it does not implement Git integration.

## Decision context

Daytona can supply the repository operations for much of Codaloud. Its TypeScript SDK exposes **20 Git methods**, and its Toolbox API additionally exposes **basic commit history without a corresponding `sandbox.git` method**. The clear gaps for the intended product are readable diffs and the commands/state handling needed for conflict resolution. Some advanced options on otherwise supported operations also need our own adapter.

“Implement ourselves” means invoking the existing Git executable inside the Daytona sandbox and translating results into application data, or composing Daytona operations. It does not mean implementing Git algorithms. Daytona provides command execution through `sandbox.process.executeCommand(command, cwd, env, timeout)` and sessions for longer processes. [Daytona Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/)

The baseline is the Notion page [Codaloud](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1), fetched September 11, last edited September 11. Its Git flow requires status, changed/untracked files, basic history, readable diffs, tracked/untracked/both commit selection, separate push, first publication to a new GitHub repository, pull with an in-app conflict editor, and reliable retries. Local Git must work without GitHub connection. A graph and advanced tooling are optional. The native-only platform instructions in AGENTS.md govern this repository.

## Versions and evidence

- `package.json` requests `@daytona/sdk` `^0.210.0`; `pnpm-lock.yaml` and installed packages resolve SDK and Toolbox client **0.210.0**.
- The live [TypeScript Git reference](https://www.daytona.io/docs/en/typescript-sdk/git/) displays **v0.211**. All 20 methods below also exist in the installed 0.210.0 SDK.
- Cross-checked the installed [Git declarations](../../node_modules/@daytona/sdk/esm/Git.d.ts), [Git implementation](../../node_modules/@daytona/sdk/esm/Git.js), and [generated Toolbox Git API](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/api/git-api.d.ts) and response models. These are the exact project-version contracts underlying the inventory; local package links require dependencies to be installed.
- The [Git operations guide](https://www.daytona.io/docs/en/git-operations/) has stale coverage notes: it calls push branch/remote/upstream options Toolbox-only and shows some advanced operations only as HTTP examples. Those options and operations already exist in this project's TypeScript SDK. Prefer the installed declarations and method reference for TypeScript availability.
- No sandbox was started or mutated. This establishes documented/client support, not successful execution against the project's deployed Toolbox version. Undocumented flag pass-through and backend implementation details are not assumed.

## Complete TypeScript Git inventory

Every method below is on `sandbox.git`. Parameters shown are the meaningful capability controls; consult the linked reference and installed declarations for their positional order. These are API capabilities, not a promise that every flag of the equivalent Git command is exposed. The table's precise options and omissions were verified in the [installed 0.210.0 declarations](../../node_modules/@daytona/sdk/esm/Git.d.ts) and [implementation](../../node_modules/@daytona/sdk/esm/Git.js).

| Method | Supported operation | Controls and limits in installed 0.210.0 |
| --- | --- | --- |
| `clone` | Clone a repository | URL, destination, branch, commit ID, username/token, TLS-verification override, shallow depth. Commit checkout can leave detached HEAD. No dedicated partial-clone, single-branch, or recursive-submodule controls. |
| `init` | Initialize a repository | Path, bare mode, initial branch name. |
| `status` | Inspect working state | Current branch, per-file states, optional ahead/behind, published status, upstream and detached state. No diff content. |
| `branches` | List repository branches | Repository path; no remote/all/filter/pagination controls. |
| `createBranch` | Create a branch | Repository path and name; no explicit starting revision or tracking option. |
| `checkoutBranch` | Check out a branch or commit | Branch name; the operations guide also documents commit SHA checkout. No force/track/create options. |
| `deleteBranch` | Delete a branch | Repository path and name; no force flag or remote-branch deletion contract. |
| `add` | Stage paths | Files/directories, including `['.']` for the repository. No dedicated tracked-only, patch, or force option. |
| `commit` | Commit staged changes | Message, author, email, optional allow-empty; returns `{ sha }`. No amend or signing controls. |
| `push` | Push to a remote | Per-call credentials, branch, remote and set-upstream. No explicit expected commit, refspec, force-with-lease, or delete controls. |
| `pull` | Pull remote changes | Per-call credentials, branch and remote. No explicit merge/rebase/fast-forward policy flags. |
| `reset` | Reset HEAD/index/worktree | Mode: soft, mixed, hard, merge or keep; target revision; optional paths. Combinations still follow Git semantics. |
| `restore` | Restore files or unstage | Paths, staged/worktree selection, source revision. No patch or explicit ours/theirs option. |
| `remoteAdd` | Add or replace a remote | Name, URL, optional fetch and overwrite. Fetch here is coupled to remote configuration. |
| `remotes` | List configured remotes | Returns remote names and URLs. |
| `remoteGet` | Read one remote URL | Convenience lookup using the remote list, not a separate endpoint. |
| `getConfig` | Read a configuration key | Key and global/local/system scope; repository path for local. |
| `setConfig` | Set a configuration key | Key, value and scope; no dedicated unset/multivalue interface. |
| `configureUser` | Configure commit identity | Name, email and scope; global is the default, local requires a path. |
| `dangerouslyAuthenticate` | Persist Git credentials | Username, password/token, host, protocol. Stores plaintext credentials on sandbox disk. |

Checkout-by-SHA is explicitly documented in the [branch/commit checkout guide](https://www.daytona.io/docs/en/git-operations/#checkout-branches-or-commits). For Codaloud, retain per-operation GitHub credentials rather than switching to `dangerouslyAuthenticate`; the existing clone integration already follows that approach.

Status provides separate `staging` and `worktree` fields per file, with states for untracked, modified, added, deleted, renamed, copied, and unmerged paths. It can support file selection and conflict detection, but it does not provide conflict versions. Ahead/behind values describe tracking state; do not treat them as a fresh remote check. [Installed file status model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/file-status.d.ts), [status values](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/status.d.ts)

## Additional built-in API: commit history

`GET /git/history?path=<repository>` returns basic history. The installed generated Toolbox client exposes `GitApi.getCommitHistory(path)`, returning records with `author`, `email`, `hash`, `message`, and `timestamp`. There is no public `sandbox.git.history()` or `sandbox.git.log()` in the installed SDK. [Daytona history documentation](https://www.daytona.io/docs/en/git-operations/#get-commit-history)

This needs a small authenticated HTTP adapter, not a custom Git implementation. Codaloud already has `getSandboxToolboxUrl` and `requestDaytona` in `src/services/daytona/api.ts`; the returned sandbox-specific URL can be extended with `/git/history` and an encoded path. Avoid reaching into private SDK fields.

The history request has no documented limit, cursor, revision selector, search, or file filter. The response has no parent IDs, ref decorations, or patches. [Installed history model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/git-commit-info.d.ts), [request contract](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/api/git-api.d.ts). Therefore:

- Basic history can use the built-in endpoint, subject to checking its actual ordering and size behavior.
- Paginated history, a graph, merge identification from parent count, ref badges, and file history need additional data, usually `git log`, `git for-each-ref`, or related commands.
- Browsing another branch's history should use a read-only revision query, not check out that branch merely to change the history list. Git supports revision-limited and formatted logs. [Git log manual](https://git-scm.com/docs/git-log)

## What we need to add for the intended product

The following classification is a design inference from Codaloud's requirements and the complete Daytona contracts above. “Custom command” means no dedicated documented Git API operation for that capability; “composition” means supported primitives still need application logic.

| Product need | Commands or integration we would add | Boundary |
| --- | --- | --- |
| Readable changes | `git diff`, `git diff --cached`, comparisons between revisions; fetch file contents for display | **Custom command.** Daytona status identifies changed paths but does not return patches. Ordinary diff excludes untracked files; show them as additions using their contents or an explicit no-index comparison. Handle binary files separately. [Git diff](https://git-scm.com/docs/git-diff) |
| View a commit or an older file | `git show`, optionally `git cat-file` / `git ls-tree` | **Custom command.** Basic history metadata does not supply historical blobs or commit patches. [Git show](https://git-scm.com/docs/git-show) |
| Read competing conflict versions | `git ls-files --unmerged -z`; read stage 1/2/3 blobs via `git show` or `git cat-file` | **Custom commands plus UI.** Conflict detection is not the conflict editor. Handle missing stages for add/delete conflicts, binary files, and renames. [Git unmerged index entries](https://git-scm.com/docs/git-ls-files) |
| Finish or cancel a conflicted integration | `git merge --continue` / `git merge --abort`, or rebase equivalents if that policy is selected | **Custom workflow.** Write resolved content, stage it, verify no unmerged entries remain, then finish explicitly. A supported `commit` may finish a merge, but it does not provide the surrounding conflict lifecycle. [Git merge](https://git-scm.com/docs/git-merge) |
| Deliberate pull policy and remote refresh | `git fetch`, followed by a chosen `git merge` or `git rebase` policy | **Custom commands when we need explicit control.** Basic SDK pull is available; standalone fetch is absent. `remoteAdd(fetch=true)` is a limited alternative tied to changing/configuring remotes, not a general fetch interface. [Git fetch](https://git-scm.com/docs/git-fetch) |
| Push precisely the accepted commit | Resolve/capture commit IDs with `git rev-parse`; optionally push `<captured-sha>:refs/heads/<branch>` | **Composition, with custom push if necessary.** SDK branch selection is supported. If the branch can advance before a queued push runs, branch name alone does not pin the accepted commit. Either coordinate mutations and verify HEAD or use an explicit Git refspec. Do not assume the SDK's branch argument officially accepts arbitrary refspecs. [Git revision resolution](https://git-scm.com/docs/git-rev-parse), [Git push](https://git-scm.com/docs/git-push) |
| Tracked-only, untracked-only, or both commit choices | Select paths from status and call `add`/`commit`; optionally use `git add -u`, `git add -A`, `git ls-files --others --exclude-standard -z` | **Composition, not a missing commit command.** Define what happens to previously staged content so excluded files do not enter the commit. Include tracked deletions and respect ignores. [Git add](https://git-scm.com/docs/git-add), [Git status](https://git-scm.com/docs/git-status) |
| Publish a fresh project | GitHub create-repository API, then Daytona `remoteAdd` and `push` with upstream | **GitHub integration plus composition.** Repository name, description and visibility belong to GitHub. Creating a local repository with `init` does not create one on GitHub. [GitHub repository creation](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user) |

Initial implementation need not add every optional command above. For example, SDK pull plus custom conflict inspection/continuation is possible; fetch-plus-merge gives the application a more explicit integration boundary. A direct `log` implementation is justified by pagination or richer history, not by claiming Daytona lacks history entirely.

## Optional Git capabilities without dedicated coverage

These are useful future extensions, not all requirements for the first version. Absence is assessed against the SDK methods and generated Toolbox Git endpoints inspected above. The [Git command reference](https://git-scm.com/docs/git) documents the commands; generic sandbox process execution is the extension path.

| Capability | Custom commands/options |
| --- | --- |
| Revert a committed change | `git revert`, including continue/abort. This creates an inverse commit and is different from supported reset/restore. [Git revert](https://git-scm.com/docs/git-revert) |
| Stash changes | `git stash push/list/show/apply/pop/drop/clear` |
| Cherry-pick and rebase | `git cherry-pick`, `git rebase`, their continue/skip/abort workflows |
| Tags | `git tag`, tag deletion, tag-specific push/fetch |
| Additional branch management | Rename, explicit start point, tracking changes, remote deletion, richer remote branch discovery: `git branch`, `git for-each-ref`, `git ls-remote` |
| Additional remote management | `git remote remove/rename/prune/set-url` variants; basic URL replacement is already possible with `remoteAdd(overwrite=true)` |
| Advanced commits and staging | Amend, signing, partial-hunk staging, patch application: `git commit --amend`, `git add -p`, `git apply --cached` |
| Tracked file operations and cleanup | `git rm`, `git mv`, `git clean`; ordinary file deletion/rename plus staging can cover basic app file operations |
| History exploration and recovery | `git blame`, `git reflog`, `git bisect`, `git rev-list`, richer `git log` queries/graph output |
| Multiple working trees | `git worktree` |
| Larger or specialized repositories | Submodule operations, sparse checkout, partial clone, Git LFS tooling, shallow-history deepening/unshallowing |
| Export and maintenance | `git archive`, `git bundle`, `git gc`, `git fsck` |
| Provider collaboration | Pull requests, reviews, checks, releases, branch protection: GitHub APIs, not local Git commands. [GitHub pull-request API](https://docs.github.com/en/rest/pulls/pulls) |

This is the useful application-level gap list, not a requirement to wrap every Git plumbing command. Generic process execution can reach additional Git commands when the installed sandbox tooling supports them.

## Suggested architecture boundary

Keep one server-side Git service that owns the repository state contract. Native screens and voice actions should call product operations such as read changes, commit selection, push captured commit, pull, and finish conflict resolution. Internally that service can choose Daytona SDK methods, Toolbox endpoints, or Git commands.

| Approach | Benefit | Cost |
| --- | --- | --- |
| Daytona methods/API plus CLI for gaps | Reuses the existing SDK clone and HTTP transport; smallest initial expansion | Normalize different result/error shapes and verify equivalent repository behavior across paths |
| CLI for all local Git, Daytona for execution | One command/result model and explicit Git options throughout | Own credential injection, parsing, version compatibility and every command wrapper |

My recommendation is to start with the first approach behind that single interface. Keep related steps together: a controlled fetch/merge/conflict workflow can use the CLI throughout even if clone, status, and ordinary commits use Daytona. There is no need to expose this choice to mobile components or commit to an all-or-nothing transport decision now.

The service still needs these application responsibilities regardless of transport, as required by the Notion scope:

- Finish pending editor saves before commands depend on them, coordinate mutations per project, and refresh editor contents after checkout, pull or restore.
- Capture branch, commit and relevant file state when accepting work; validate that state before delayed mutations.
- Persist job results and partial success. A completed commit followed by a failed push must retry only the push.
- Resolve GitHub credentials on the server and use transient authentication. Keep GitHub identity/permissions separate from local Git author configuration.
- For CLI adapters, reuse the existing sandbox command payload helper, pass user values as argument data, use stable machine-readable output, and bound output. Git's porcelain status and NUL-separated path formats are intended for programmatic consumers. [Git status output](https://git-scm.com/docs/git-status)

Existing unchanged integration points:

1. `src/services/daytona/clone-github-repository.ts`: SDK clone with selected branch and transient credentials.
2. `src/services/daytona/api.ts`: authenticated Toolbox transport and sandbox ownership/state checks.
3. `src/services/daytona/create-command.ts`: structured payload transport for scripts running inside Daytona.
4. `src/services/github/server/access.ts`: server-side GitHub credential resolution.
5. `src/features/projects/hooks/use-project-workspace-branch.tsx`: current branch/history state is demo data; changing its branch does not perform a Git checkout.

## Checks to settle before implementation

Use a disposable repository in the actual project sandbox image to check deployed capabilities and edge cases: empty/unborn repositories; history ordering/size; branch-list coverage; tracked deletion and nested untracked staging; conflict state after pull; merge completion; and push of a captured commit. Check `git --version` for CLI compatibility. The public method contracts do not establish these runtime details.

No application code, dependencies, tests, or running services were changed by this research.
