# Daytona repository changes: API and Git command research

Researched September 13, 2026. This note supplies provider contracts and command examples for the [implementation plan](repository-changes-plan.md). It does not implement application behavior. Examples are illustrative adapter fragments, with validation and parsing responsibilities explicitly identified below.

## Recommendation grounded in the current code

Keep the existing local history implementation in [commits.ts](../../src/services/daytona/commits.ts) and [commits-command.ts](../../src/services/daytona/commits-command.ts). It already reads the sandbox Git repository, pins pagination to a commit SHA, returns parent hashes and full messages, and exposes shallow-history state. Add a bounded repository-status command and per-file diff reads through the same Daytona transport. Read local unpushed commits and saved working files from the sandbox; editor buffers must finish saving first.

The September 11–12 [capabilities](daytona-git-capabilities.md) and [history](daytona-commit-history.md) notes correctly identified Daytona's basic history endpoint, but their recommendation predates the implemented paginated CLI history. Switching the existing implementation to that endpoint would lose controls the app now uses. This conclusion follows from the current source and the installed provider declarations, rather than from assumptions about an unimplemented history screen.

## Verified provider contracts

The installed package is **`@daytona/sdk` 0.210.0**, with `@daytona/toolbox-api-client` 0.210.0. The live docs display v0.211. Exact compatibility evidence: [package metadata](../../node_modules/@daytona/sdk/package.json), [Git declarations](../../node_modules/@daytona/sdk/esm/Git.d.ts), and [generated Git API declarations](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/api/git-api.d.ts).

| Required information | Available API | Exact limits and integration decision |
| --- | --- | --- |
| Branch and changed/untracked paths | `sandbox.git.status(path: string): Promise<GitStatus>`; HTTP `GET /git/status?path=...` | Returns separate staging/worktree states. No patch content. Usable for a basic list; use porcelain v2 when precise branch OID, rename fields and untracked enumeration are required. |
| Basic commit history | HTTP `GET /git/history?path=...`; generated `GitApi.getCommitHistory(path, options?)` | No `sandbox.git.history()` or `log()` in installed SDK. Endpoint parameters do not include pagination, revision or file filters. Preserve the richer existing CLI implementation. |
| Branch list | `sandbox.git.branches(path)`; HTTP `GET /git/branches?path=...` | Already integrated in [branches.ts](../../src/services/daytona/branches.ts). Selecting a history branch is separate from checking out the repository. |
| Saved current file bytes | Daytona filesystem APIs or existing `readSandboxFileContent` | Reuse [filesystem.ts](../../src/services/daytona/filesystem.ts), which enforces bounds, encoding and path protections. |
| Patches, historical/index blobs, per-file history | No dedicated method or endpoint in the inspected Git contracts | Invoke Git through process execution and normalize the response. |

The SDK method inventory and status entry point are documented in the [Daytona Git reference](https://www.daytona.io/docs/en/typescript-sdk/git/). The extra history endpoint is in the [Daytona Git operations guide](https://www.daytona.io/docs/en/git-operations/#get-commit-history). Filesystem operations are covered by the [FileSystem reference](https://www.daytona.io/docs/en/typescript-sdk/file-system/).

The installed response models have these fields:

```ts
// Structural summaries of the installed declarations; not new application types.
type DaytonaGitStatus = {
  currentBranch: string;
  ahead?: number;
  behind?: number;
  branchPublished?: boolean;
  detached?: boolean;
  upstream?: string;
  fileStatus: {
    name: string;
    extra: string;
    staging: string;
    worktree: string;
  }[];
};

type DaytonaHistoryItem = {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
};
```

The actual `staging` and `worktree` types are a generated enum: `Unmodified`, `Untracked`, `Modified`, `Added`, `Deleted`, `Renamed`, `Copied`, `Updated but unmerged`, plus the generated unknown fallback `11184809`. Preserve unknown states safely. The `extra` string's meaning is not documented in the installed model; do not assume it is always a rename source. History `timestamp` has no documented author-versus-committer semantics. [Installed status model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/git-status.d.ts), [file model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/file-status.d.ts), [enum](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/status.d.ts), [history model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/git-commit-info.d.ts).

## Existing transport to reuse

The SDK signature is `executeCommand(command: string, cwd?: string, env?: Record<string, string>, timeout?: number): Promise<ExecuteResponse>`. The timeout is in seconds; use the fourth argument, despite an erroneous three-argument timeout example in the docs. Results expose `exitCode`, `result`, and `artifacts.stdout`. [Daytona Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand), [installed declaration](../../node_modules/@daytona/sdk/esm/Process.d.ts).

Codaloud's API routes already use HTTP because SDK transitive ESM dependencies fail in their bundle. Reuse `getSandboxToolboxUrl`, `requestDaytona`, and `createSandboxCommand`; the latter compresses JSON into environment chunks and quotes the fixed script. Resolve the sandbox from the authenticated user's project, and derive the workspace from `/user-home-dir` plus `/.codaloud/workspace`. Never accept an arbitrary sandbox ID, repository directory, executable, or Git argument list from the client. [Existing transport](../../src/services/daytona/api.ts), [payload helper](../../src/services/daytona/create-command.ts), [branch transport rationale](../../src/services/daytona/branches.ts).

```ts
// Server adapter fragment. Preconditions: authenticated project ownership,
// verified sandbox, derived home path, and a fixed reviewed script.
const execution = await requestDaytona(`${toolbox}/process/execute`, {
  method: "POST",
  signal,
  body: JSON.stringify(createSandboxCommand(
    sandboxStatusCommand,
    { home },
    12,
  )),
});
// Next: validate execution envelope, check exitCode, parse result JSON,
// validate the product response schema, and map safe API errors.
```

A client HTTP abort alone is not evidence that remote work ended. Bound the remote execution and each child process; keep the HTTP deadline slightly longer. The existing history service supplies a useful pattern, but its 4 MiB output ceiling is a starting point to evaluate, not an automatic choice for every diff response.

## Status: preserve index and working-tree state

Use a single machine-readable status read:

```ts
// Arguments for the server-owned Git runner; never shell interpolation.
const statusArgs = [
  "status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z",
];
```

Porcelain v2 includes branch headers, ordinary entries (`1`), rename/copy entries (`2`), unmerged entries (`u`), and untracked entries (`?`). `-z` preserves paths containing spaces/newlines; rename entries consume an additional NUL-delimited source path. Parse record-specific fixed fields instead of splitting every record on spaces. Branch OID can be `(initial)` and branch name `(detached)`. Ignore unfamiliar headers for forward compatibility. [Git status format](https://git-scm.com/docs/git-status#_porcelain_format_version_2).

One file needs both index and worktree status. Example verified locally: edit `base` to `staged`, stage it, then edit it back to `base`. Status is `MM`; both comparisons contain a change, although the net comparison with HEAD is empty. A single boolean or `git diff HEAD` cannot represent this state correctly. The sidebar's changed count should count distinct paths; the changes screen can show the same path in staged and unstaged groups.

Ignored files should stay out of ordinary changes. For a separate untracked-only read, Git exposes `ls-files --others --exclude-standard -z`; use this only if the full status command does not already provide the required paths. [Git ls-files](https://git-scm.com/docs/git-ls-files).

## Diffs: make the comparison explicit

The essential comparisons are:

| UI view | Git arguments after `git` | Meaning |
| --- | --- | --- |
| Unstaged tracked change | `diff -- path` | Index to saved working file |
| Staged change | `diff --cached -- path` | HEAD to index; omit explicit HEAD so unborn branches work |
| Combined saved change | `diff HEAD -- path` | HEAD to working file; supplementary view only |
| Commit change | `diff parentSha commitSha -- path` | Selected parent's tree to selected commit's tree |
| Untracked addition | Bounded current bytes with empty previous side | No index mutation needed |

Ordinary diff excludes untracked files. `--no-index /dev/null <file>` is another way to create their patch; exit code **1 means differences**, not execution failure. Prefer the existing protected content reader and an additions-only response for initial untracked support. Never run `git add`, including intent-to-add, merely to display a preview. [Git diff semantics](https://git-scm.com/docs/git-diff).

```ts
// Illustrative fragment inside a fixed sandbox script.
// git() is a private bounded execFileSync wrapper, not a public arbitrary runner.
const readTrackedPatch = (scope, relativePath) => {
  const options = [
    "diff", "--no-color", "--no-ext-diff", "--no-textconv",
    "--no-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/",
  ];
  switch (scope) {
    case "staged":
      return git([...options, "--cached", "--", relativePath]);
    case "unstaged":
      return git([...options, "--", relativePath]);
    default:
      throw new Error("INVALID_DIFF_SCOPE");
  }
};
```

This initial patch example deliberately presents rename sides as deletion/addition. If status supplies a rename, include both old and new paths, or show their bounded old/new blobs as one rename. A destination-only path filter cannot reliably describe both sides. Keep path selection in metadata; do not recover authoritative paths by parsing quoted patch headings.

For commit details, use parent hashes already returned by history. Default merge comparisons to the first parent and label that choice; allow choosing another parent later. Root commits have no parent: `git diff-tree --root --no-commit-id --name-status -r -z <sha>` supplies their changed files, and adding `-p` supplies their patch. Ordinary commit file lists can use `git diff --name-status -z <parent> <sha> --`. [Git diff-tree](https://git-scm.com/docs/git-diff-tree).

If a native diff component needs full left/right documents rather than a patch, read immutable blobs with `git cat-file` after resolving their OIDs, checking type and size before content. HEAD/tree, index, and saved working bytes are distinct sources. Stage-zero index blobs describe staged content; conflict stages 1/2/3 require a separate conflict UI. Return metadata for binary files, submodules, symlinks and mode-only changes instead of decoding them as ordinary text. [Git cat-file](https://git-scm.com/docs/git-cat-file), [Git index stages](https://git-scm.com/docs/git-ls-files#_output).

## History and current-file history

The existing command uses a fixed snapshot SHA and `git log --topo-order -z` with `%H`, `%an`, `%ae`, `%cI`, `%P`, and `%B`, returning commit hash, author, author email, committer timestamp, parents, and full message. Keep its page-size-plus-one strategy and signed/scoped cursor. For file history, a future extension can add `-- <literal-path>`; `--follow` supports a single path and requires a deliberate rename-following policy. Never checkout a branch simply to browse its history. [Git log](https://git-scm.com/docs/git-log), [current implementation](../../src/services/daytona/commits-command.ts).

Status and working-tree diffs always belong to the **actual checkout**. History may display another selected branch. Include actual branch and HEAD in status responses and cache keys; do not label current files using the history dropdown's branch value. Ahead/behind is relative to locally stored tracking refs, not proof of a fresh remote comparison. A fetch is a separate future operation, not a prerequisite for local reads.

## Execution and consistency requirements

These are implementation recommendations derived from the current code and the linked tool contracts:

1. Reuse the existing child-process pattern: `execFileSync("git", fixedArgs, { cwd, env, timeout, maxBuffer, stdio })`, with no shell. Transport dynamic values as JSON data. `execFileSync` avoids shell parsing and supports timeout/output limits. [Node child processes](https://nodejs.org/api/child_process.html#child_processexecfilesyncfile-args-options).
2. Sanitize inherited `GIT_*` variables, disable optional locks and interactive prompts, and use `--no-pager`, `--no-replace-objects`, and `--literal-pathspecs`. `--` prevents option interpretation but does not by itself disable Git's pathspec magic. Validate hashes/references separately with `rev-parse --verify --end-of-options`; allow only approved comparison modes. [Git global options](https://git-scm.com/docs/git), [revision validation](https://git-scm.com/docs/git-rev-parse).
3. Disable external diff/textconv and set `-c core.fsmonitor=false` for the new status/diff runner. Repository configuration can name executable helpers. Keep submodule traversal limited and explicit. Reuse path restrictions and anchored reads from the existing filesystem service; do not introduce a weaker raw filesystem reader for untracked files. [Git configuration](https://git-scm.com/docs/git-config), [existing protected reads](../../src/services/daytona/filesystem.ts).
4. Return list metadata first; load one file's patch on demand. Set output, file-size and elapsed-time limits; represent oversized/binary/unsupported files explicitly. Do not silently cut off a patch and present it as complete. Limit concurrency per sandbox. No remote fetch, credentials or GitHub connection is needed for these local reads.
5. Flush pending editor saves before a requested fresh review. Capture HEAD/index/worktree context before and after a bounded diff; if relevant values change, return a retryable stale result. This detects ordinary concurrent changes but is not an atomic repository snapshot. Any later commit operation must revalidate the reviewed state and coordinate with all app-controlled writers.

## Verification and remaining uncertainty

Read official current documentation and installed 0.210.0 declarations. Ran a disposable local Git 2.55.0 fixture, removed automatically afterward. It confirmed unborn cached diff succeeds, root commits list added files, staged/unstaged changes can cancel in the HEAD-to-worktree comparison, and untracked no-index diff exits 1 without staging the file. No application tests or live sandbox calls ran; no app process was started.

Implementation still needs a disposable fixture in the actual sandbox image to verify Git version, nested untracked paths, rename/copy/conflict parsing, unusual filenames, symlinks, binary/large files, stopped-sandbox restoration, and concurrent saves. Exact deployed Toolbox status/history behavior is unverified; the recommended command path avoids relying on its undocumented rename and history-pagination details.
