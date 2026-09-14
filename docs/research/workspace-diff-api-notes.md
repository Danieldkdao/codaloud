# Workspace diff: Daytona and Git integration notes

Researched September 13, 2026. This is research for the workspace diff plan; no application behavior changed.

## Start with the existing implementation

The current repository already obtains **real staged and unstaged unified patches**. The mock workspace diff screen does not require a new Daytona integration to begin displaying real changes. Reuse the existing [changes service](../../src/services/daytona/changes.ts), [sandbox command](../../src/services/daytona/changes-command.ts), and [response schemas](../../src/features/projects/actions/change-schemas.ts).

The older [repository changes research](daytona-repository-changes-api-research.md), [changes plan](repository-changes-plan.md), and [Git capabilities](daytona-git-capabilities.md) explain the underlying decisions. Their future-tense descriptions of status/diff collection predate the implementation now present in the source. The source is the authority for what remains to build.

The existing collector:

1. Resolves the signed-in user and owned ready project, validates sandbox ownership/state, and derives `~/.codaloud/workspace` from Daytona's home directory.
2. Runs a fixed Node script using `createSandboxCommand` over authenticated Toolbox HTTP.
3. Reads porcelain v2 status, branch/HEAD, rename paths, modes, and HEAD/index object IDs.
4. Reads immutable Git blobs and bounded saved working file contents.
5. Compares captured bytes using `git diff --no-index`, rather than allowing repository attributes or a concurrent file replacement to substitute the rendered content.
6. Returns separate staged and unstaged patches with addition/deletion counts; represents unsupported previews explicitly.
7. Rechecks status, index, and observed working file metadata, returning `WORKSPACE_CHANGED` on detected changes.

These are source findings, not a new proposed collector. Initial workspace UI work should consume this response directly. [Current command](../../src/services/daytona/changes-command.ts)

## Version-aware Daytona contracts

`package.json` requests `@daytona/sdk: ^0.210.0`; the installed package resolves **0.210.0**. The installed Git declarations and current official method reference contain status and ordinary Git operations, but **no `sandbox.git.diff()`**. Status supplies metadata, not patch text. [Installed package](../../node_modules/@daytona/sdk/package.json), [installed Git declarations](../../node_modules/@daytona/sdk/esm/Git.d.ts), [Daytona Git reference](https://www.daytona.io/docs/en/typescript-sdk/git/)

Relevant installed signatures:

```ts
status(path: string): Promise<GitStatus>;

executeCommand(
  command: string,
  cwd?: string,
  env?: Record<string, string>,
  timeout?: number,
): Promise<ExecuteResponse>;

downloadFile(remotePath: string, timeout?: number): Promise<Buffer>;
downloadFile(
  remotePath: string,
  localPath: string,
  timeout?: number,
): Promise<void>;
```

Process timeout is measured in seconds and belongs in the **fourth** SDK argument. Execution returns `exitCode`, `result`, and stdout in `artifacts.stdout`. The installed documentation includes a stale three-argument timeout example; follow the declaration. [Installed Process declaration](../../node_modules/@daytona/sdk/esm/Process.d.ts), [Daytona Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/)

The Buffer download overload loads the whole file into memory; the local-path overload streams to disk. Neither enforces Codaloud's repository-relative path or text-size policy. Reuse the protected file-content reader for app documents. [Daytona FileSystem reference](https://www.daytona.io/docs/en/typescript-sdk/file-system/), [existing content reader](../../src/services/daytona/file-content-command.ts)

Codaloud's API routes already use HTTP transport. A new service should preserve that choice and the existing authentication/error handling, rather than introducing a second SDK initialization path. This illustrates the existing call shape, not a replacement implementation:

```ts
const response = await requestDaytona(`${toolbox}/process/execute`, {
  method: "POST",
  signal: requestSignal,
  body: JSON.stringify(
    createSandboxCommand(
      sandboxChangesCommand,
      { home, allowEmptyRepository: !existingProject.githubRepositoryId },
      12,
    ),
  ),
});
// Existing service then validates the execution envelope, checks exitCode,
// parses result JSON, and validates projectRepositoryChangesSchema.
```

[Transport](../../src/services/daytona/api.ts), [command payload helper](../../src/services/daytona/create-command.ts), [changes service](../../src/services/daytona/changes.ts)

## Preserve the comparison meaning

| Scope | Before | After | Equivalent ordinary Git view |
| --- | --- | --- | --- |
| Staged | HEAD blob, or empty on an unborn branch | Index blob | `git diff --cached` |
| Unstaged tracked | Index blob | Saved working file | `git diff` |
| Untracked | Empty | Saved working file | Explicit addition or no-index comparison |
| Optional combined | HEAD blob | Saved working file | `git diff HEAD` |

Git's default diff excludes untracked files. Cached diff without an explicit commit works before the first commit. No-index diff exits 1 when differences exist; that exit code is successful comparison output. A combined view can hide staged/unstaged changes that cancel each other: HEAD `A`, index `B`, worktree `A`. Therefore it must not replace the two existing scopes. [Git diff manual](https://git-scm.com/docs/git-diff)

Do not concatenate staged and unstaged patches and call them HEAD-to-workspace. In the first UI, let users choose **Unstaged** or **Staged** and display those exact comparisons. Display the actual checkout branch supplied by the response; history's selected branch can be different. The current response already separates `indexStatus`, `worktreeStatus`, `staged`, `unstaged`, `currentBranch`, and `headSha`. [Current schema](../../src/features/projects/actions/change-schemas.ts)

For a later full-document viewer, preserve the same byte sources. Porcelain v2 provides HEAD/index OIDs for normal and rename records; `git cat-file -s <oid>` checks size and `git cat-file blob <oid>` reads raw content. Do not reconstruct an entire document from three-line patch context. [Git status format](https://git-scm.com/docs/git-status#_porcelain_format_version_2), [Git cat-file](https://git-scm.com/docs/git-cat-file)

## Existing edge handling to preserve

The following behavior is implemented in the current collector, including deliberate product limits. It is not a statement of Daytona limits. [Command](../../src/services/daytona/changes-command.ts), [schema](../../src/features/projects/actions/change-schemas.ts)

| Case | Current contract and UI consequence |
| --- | --- |
| No Git repository | `repositoryState: "not-initialized"`, empty changes, allowed only for a non-imported project. Distinguish from a broken imported workspace. |
| Unborn branch | `repositoryState: "unborn"`, no HEAD; staged/untracked additions remain readable. |
| Rename | `originalPath` and `path` are authoritative metadata. Headings must show both; do not derive identity from patch headers. |
| Binary/invalid UTF-8 | `unavailableReason: "binary"`; patch and counts are null. Show an explanatory preview state, not zero changes. |
| Oversized | 1 MiB file/blob; 256 KiB patch; unavailable preview instead of silently truncated code. |
| Conflict | `isConflicted`, unavailable reason `conflict`; ordinary diff viewer does not resolve conflicts. |
| Symlink/submodule | Kind metadata and unsupported preview; do not follow symlinks or download submodule trees. |
| Mode-only change | Preserve old/new mode and show its meaning even when patch has no hunks. |
| Large repository | Maximum 5,000 changes and 8 MiB response; all patches are currently eager. Exceeding limits fails explicitly. |
| Concurrent edits | Reader rejects detected changes; response is an observed result, not an atomic transaction or guarantee of future commit identity. |

Porcelain records are NUL-delimited, with an extra source-path record for renames. Keep exact paths containing whitespace; do not trim or split paths on spaces. Git supports arbitrary bytes in filenames; this application intentionally rejects paths it cannot safely represent as UTF-8. [Git status](https://git-scm.com/docs/git-status)

The current runner also disables configured filters and fsmonitor, uses literal pathspecs and fixed executable arguments, rejects external Git object stores/worktrees, and reuses anchored file reads. Preserve those protections if extracting helpers for lazy reads. A simpler `git diff HEAD` command would change both the content model and the protections. [Current command](../../src/services/daytona/changes-command.ts)

## What should change later for full editor-quality viewing

These are recommendations derived from the current implementation:

- First wire the existing response to a read-only unified hunk viewer. It needs no new provider API or client-side diff computation.
- Add an on-demand per-file endpoint when full syntax-aware documents, expandable hidden context, or a merge editor require complete before/after text. Authenticate exactly like `readSandboxChanges`; accept only project ID, validated path, and explicit scope. Compare/read the same bounded captured bytes and return content-version metadata.
- Refactor status-only versus patch reads if real repositories approach the current eager collector's eight-second script deadline. Changing only rendering virtualization does not reduce remote Git work or payload size.
- A lazy endpoint must re-read current status and select the requested entry, preserve rename OIDs and unavailable states, and detect changed review context. Never let a client submit arbitrary object expressions, Git arguments, sandbox IDs, or absolute paths.
- Save pending editor edits before an explicitly fresh review, and invalidate changes after successful writes. Unsaved client buffers are not present in the sandbox diff.

## Verification

Read current official Daytona/Git documentation, installed 0.210.0 declarations, existing research, and collector/test source. The existing [changes tests](../../src/services/daytona/tests/changes.test.ts) cover staging states, renames/deletions, unborn repositories, external filters, ownership, binary/large files, conflicts, symlinks/gitlinks, limits, and changed HEAD. They were inspected, not rerun for this documentation-only task. No live sandbox call or application process was started. Deployed sandbox Git/runtime compatibility remains a verification step for implementation.
