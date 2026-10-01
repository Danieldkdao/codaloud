import { z } from "zod";
import {
  projectCommitQuerySchema,
  commitSourceSchema,
} from "@/features/projects/actions/commit-schemas";
import { projectCommitDetailsParamsSchema } from "@/features/projects/actions/commit-details-schemas";
import { projectBranchParamsSchema } from "@/features/projects/lib/branch-params";
import {
  createProjectFileSchema,
  updateProjectFileSchema,
  deleteProjectFileSchema,
  saveProjectFileContentSchema,
  projectFilePathSchema,
  projectDirectoryPathSchema,
} from "@/features/projects/actions/file-schemas";
import { projectFileSearchQuerySchema } from "@/features/projects/actions/file-search-schemas";
import { createProjectCommitSchema } from "@/features/projects/actions/create-commit-schemas";
import { checkoutProjectBranchSchema } from "@/features/projects/actions/branch-schemas";
import {
  gitCreateBranchSchema,
  gitDeleteBranchSchema,
} from "@/features/projects/server/git-branch-schemas";
import { gitPushSchema } from "@/features/projects/server/git-push-schemas";
import { gitPullSchema } from "@/features/projects/server/git-pull-schemas";
import {
  gitStashPushSchema,
  gitStashPopSchema,
  gitStashDropSchema,
  gitStashQuerySchema,
} from "@/features/projects/server/git-stash-schemas";
import { gitDiscardSchema } from "@/features/projects/server/git-discard-schemas";
import { gitUndoSchema } from "@/features/projects/server/git-undo-schemas";
import { gitRevertSchema } from "@/features/projects/server/git-revert-schemas";
import { publishProjectSchema } from "@/features/projects/actions/publish-schemas";

const empty = z.strictObject({});
// Definitions stay platform-neutral. Native actions are imported only by the phone.
export const workspaceTools = {
  readTerminalOutput: {
    description:
      "Read this project's recent visible terminal output, connection status, access denial or error, and sync status. Output is bounded and may be truncated. An empty output means no terminal output is retained in this app session.",
    schema: z.strictObject({}),
    mutation: false,
  },
  runTerminalCommand: {
    description:
      "Run a command in this project's Daytona execution sandbox, show its output in the same terminal panel, then sync file changes back to the device. Use a bounded command and inspect the exit code. Commands can install dependencies or change files.",
    schema: z.strictObject({
      command: z
        .string()
        .min(1)
        .max(2000)
        .describe("Shell command to run in the project workspace."),
      timeout: z
        .number()
        .int()
        .min(1)
        .max(120)
        .default(60)
        .describe("Maximum execution time in seconds."),
    }),
    mutation: true,
  },
  readFile: {
    description:
      "Read a bounded text file excerpt, its hash, and available on-device diagnostics for supported code and config files. Each diagnostic includes its source, severity, code, and one-based line/column positions. TypeScript files include compiler diagnostics; other code and config formats report parser findings. Diagnostics report ready, unavailable or unsupported and may be truncated. They are not ESLint results or full compiler checks for every language. Lines are one-based. Read before editing.",
    schema: z.strictObject({
      path: projectFilePathSchema.describe(
        'Existing project-relative file path, e.g. "src/index.ts"; 1–4096 characters, no absolute paths or . / .. segments.',
      ),
      startLine: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe(
          "First line to read, a one-based positive integer; defaults to 1.",
        ),
      lineCount: z
        .number()
        .int()
        .min(1)
        .max(150)
        .default(100)
        .describe(
          "Maximum number of lines to read, an integer from 1 to 150; defaults to 100.",
        ),
    }),
    mutation: false,
  },
  listFiles: {
    description:
      'List a folder and file sizes. For the project root use {"path":""}, not "." or "/". Subfolders use project-relative paths such as "src".',
    schema: z.strictObject({
      path: projectDirectoryPathSchema
        .default("")
        .describe(
          'Project-relative folder path, at most 4096 characters. Use "" for the root (the default) or "src" for a subfolder. No absolute paths or . / .. segments.',
        ),
    }),
    mutation: false,
  },
  searchFiles: {
    description:
      "Search project filenames or contents. Returns paths to read, not entire files.",
    schema: projectFileSearchQuerySchema.safeExtend({
      search: projectFileSearchQuerySchema.shape.search.describe(
        "Nonblank search text, 1–256 characters; no NUL characters.",
      ),
      scope: projectFileSearchQuerySchema.shape.scope.describe(
        'Search "title" for filenames, "content" for file contents, or "all" for both; defaults to "all".',
      ),
      path: projectFileSearchQuerySchema.shape.path.describe(
        'Project-relative folder to search; "" means project root and is the default. No absolute paths or . / .. segments; at most 4096 characters.',
      ),
      pageSize: projectFileSearchQuerySchema.shape.pageSize.describe(
        "Maximum results per page, an integer from 1 to 100; defaults to 10.",
      ),
      cursor: projectFileSearchQuerySchema.shape.cursor.describe(
        "Opaque continuation cursor returned by the previous search with the same filters; omit for the first page. Do not invent or modify it.",
      ),
    }),
    mutation: false,
  },
  saveFile: {
    description:
      "Replace a small file after reading all its content, with the exact hash from readFile. Requires all three arguments: path, the complete new content, and expectedContentHash. Never call this with partial or empty arguments. Files over 8000 characters require editFile.",
    schema: saveProjectFileContentSchema.safeExtend({
      path: saveProjectFileContentSchema.shape.path.describe(
        'Existing project-relative file path, e.g. "src/index.ts"; 1–4096 characters, no absolute paths or . / .. segments.',
      ),
      content: saveProjectFileContentSchema.shape.content.describe(
        "Complete replacement UTF-8 text, not a patch; empty text clears the file. At most 1 MiB, no NUL characters. Read the whole file first; use editFile for existing files over 8000 characters.",
      ),
      expectedContentHash:
        saveProjectFileContentSchema.shape.expectedContentHash.describe(
          "Exact current file content hash returned by readFile or the last successful save: 64 lowercase hexadecimal SHA-256 characters, not a Git commit SHA.",
        ),
    }),
    mutation: true,
  },
  editFile: {
    description:
      "Replace one unique exact text excerpt, preserving the rest of the file. Pass the file hash from readFile. Preferred for targeted edits and large files. Requires all four arguments: path, expectedContentHash, oldText, and newText. Never call this with partial or empty arguments.",
    schema: saveProjectFileContentSchema
      .pick({ path: true, expectedContentHash: true })
      .extend({
        path: saveProjectFileContentSchema.shape.path.describe(
          'Existing project-relative file path, e.g. "src/index.ts"; 1–4096 characters, no absolute paths or . / .. segments.',
        ),
        expectedContentHash:
          saveProjectFileContentSchema.shape.expectedContentHash.describe(
            "Exact current file content hash from readFile or the last successful save: 64 lowercase hexadecimal SHA-256 characters, not a Git commit SHA.",
          ),
        oldText: z
          .string()
          .min(1)
          .max(8000)
          .describe(
            "Exact text to replace, including whitespace, occurring exactly once in the current file; 1–8000 characters. Copy it from readFile.",
          ),
        newText: z
          .string()
          .max(10000)
          .describe(
            'Replacement text for oldText, at most 10000 characters; use "" to delete that excerpt.',
          ),
      }),
    mutation: true,
  },
  createFile: {
    description: "Create a file or folder inside the project.",
    schema: createProjectFileSchema.safeExtend({
      parentPath: createProjectFileSchema.shape.parentPath.describe(
        'Existing project-relative parent folder; "" means project root. At most 4096 characters; no absolute paths or . / .. segments.',
      ),
      name: createProjectFileSchema.shape.name.describe(
        'New file or folder basename, e.g. "test.ts"; nonblank, at most 255 UTF-8 bytes, no slashes or control characters, not "." or "..".',
      ),
      kind: createProjectFileSchema.shape.kind.describe(
        'Use "file" to create an empty file or "folder" to create a directory. To populate a file, subsequently readFile and saveFile.',
      ),
    }),
    mutation: true,
  },
  renameFile: {
    description: "Rename a file or folder inside its parent.",
    schema: updateProjectFileSchema.safeExtend({
      parentPath: updateProjectFileSchema.shape.parentPath.describe(
        'Project-relative parent folder containing the target; "" means project root. At most 4096 characters; no absolute paths or . / .. segments. Renaming stays in this folder.',
      ),
      name: updateProjectFileSchema.shape.name.describe(
        'New basename; nonblank, at most 255 UTF-8 bytes, no slashes or control characters, not "." or "..".',
      ),
      kind: updateProjectFileSchema.shape.kind.describe(
        'Target entry type: "file" or "folder". Match the existing entry.',
      ),
      previousName: updateProjectFileSchema.shape.previousName.describe(
        'Existing basename to rename, not a path; nonblank, at most 255 UTF-8 bytes, no slashes or control characters, not "." or "..".',
      ),
    }),
    mutation: true,
  },
  deleteFile: {
    description:
      "Delete a file or folder only when explicitly requested by the user.",
    schema: deleteProjectFileSchema.safeExtend({
      parentPath: deleteProjectFileSchema.shape.parentPath.describe(
        'Project-relative parent folder containing the target; "" means project root. At most 4096 characters; no absolute paths or . / .. segments.',
      ),
      name: deleteProjectFileSchema.shape.name.describe(
        'Existing basename explicitly requested for deletion; nonblank, at most 255 UTF-8 bytes, no slashes or control characters, not "." or "..".',
      ),
      kind: deleteProjectFileSchema.shape.kind.describe(
        'Target entry type: "file" or "folder". Match the existing entry; folder deletion also removes its contents.',
      ),
    }),
    mutation: true,
  },
  gitBranches: {
    description: "List local and remote branch names with bounded pagination.",
    schema: z.strictObject({
      search: z
        .string()
        .max(200)
        .default("")
        .describe(
          'Branch-name filter, at most 200 characters; "" means no filter and is the default.',
        ),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe(
          "Maximum branches per page, an integer from 1 to 50; defaults to 20.",
        ),
      cursor: projectBranchParamsSchema.shape.cursor.describe(
        "Opaque continuation cursor from the previous branch listing for the same project and search; omit or use null for the first page. Do not invent or modify it.",
      ),
    }),
    mutation: false,
  },
  gitHistory: {
    description: "Read a bounded page of commit history.",
    schema: projectCommitQuerySchema.extend({
      branch: projectCommitQuerySchema.shape.branch.describe(
        "Branch name from gitBranches, 1–1024 characters; use its short name, not a full refs/... name.",
      ),
      search: projectCommitQuerySchema.shape.search.describe(
        'Commit-message filter, at most 200 characters; "" means no filter and is the default.',
      ),
      author: projectCommitQuerySchema.shape.author.describe(
        'Commit-author filter, at most 200 characters; "" means no filter and is the default.',
      ),
      pageSize: projectCommitQuerySchema.shape.pageSize.describe(
        "Maximum commits per page, an integer from 1 to 100; defaults to 20.",
      ),
      cursor: projectCommitQuerySchema.shape.cursor.describe(
        "Opaque continuation cursor from the previous history page for the same branch, source and filters; omit or use null for the first page. Do not invent or modify it.",
      ),
      source: commitSourceSchema.describe(
        'Read "local" or "remote" history; match the branch source returned by gitBranches.',
      ),
    }),
    mutation: false,
  },
  gitCommitDetails: {
    description: "Inspect a commit and its changes.",
    schema: projectCommitDetailsParamsSchema
      .omit({ projectId: true })
      .safeExtend({
        commitSha: projectCommitDetailsParamsSchema.shape.commitSha.describe(
          "Full commit SHA from gitHistory: exactly 40 or 64 lowercase hexadecimal characters; not an abbreviated hash.",
        ),
        source: projectCommitDetailsParamsSchema.shape.source.describe(
          'Commit source: "local" or "remote"; use the source of the history entry.',
        ),
      }),
    mutation: false,
  },
  gitStatus: {
    description: "Read branch, HEAD, incoming and outgoing commit counts.",
    schema: empty,
    mutation: false,
  },
  gitChanges: {
    description:
      "Read working tree changes and bounded diffs before committing.",
    schema: empty,
    mutation: false,
  },
  gitCommit: {
    description:
      "Commit the explicitly selected changed paths with a commit message. Does not push.",
    schema: createProjectCommitSchema.safeExtend({
      message: createProjectCommitSchema.shape.message.describe(
        "Commit message describing the selected changes; 1–5000 characters after trimming, no NUL characters.",
      ),
      paths: createProjectCommitSchema.shape.paths.describe(
        '1–5000 unique changed file paths selected from gitChanges, including deletions when requested. Each path is 1–4096 characters; no empty, ".", ".." or ".git" segments or NUL characters. Use exact file paths, not folders or globs; include only authorized changes.',
      ),
    }),
    mutation: true,
  },
  gitCheckout: {
    description: "Switch to an existing branch.",
    schema: checkoutProjectBranchSchema.safeExtend({
      branchName: checkoutProjectBranchSchema.shape.branchName.describe(
        "Existing short Git branch name from gitBranches, 1–1024 characters; not a full refs/... name.",
      ),
      source: checkoutProjectBranchSchema.shape.source.describe(
        'Branch source from gitBranches: "local" or "remote"; omit only when unambiguous.',
      ),
    }),
    mutation: true,
  },
  gitCreateBranch: {
    description: "Create and switch to a new branch.",
    schema: gitCreateBranchSchema.safeExtend({
      branchName: gitCreateBranchSchema.shape.branchName.describe(
        'New valid short Git branch name, e.g. "feature/login"; 1–1024 characters, no whitespace, not HEAD or a full refs/... name.',
      ),
    }),
    mutation: true,
  },
  gitDeleteBranch: {
    description:
      "Delete a branch only when requested. Force requires explicit user authorization.",
    schema: gitDeleteBranchSchema.safeExtend({
      branchName: gitDeleteBranchSchema.shape.branchName.describe(
        "Existing short Git branch name explicitly requested for deletion, 1–1024 characters; select it from gitBranches, not a full refs/... name.",
      ),
      force: gitDeleteBranchSchema.shape.force.describe(
        "Whether to force branch deletion despite unmerged changes; omit or use false normally. Use true only with explicit user authorization.",
      ),
    }),
    mutation: true,
  },
  gitFetch: {
    description: "Fetch remote refs without changing local files.",
    schema: empty,
    mutation: true,
  },
  gitPush: {
    description:
      "Push the current branch. Force requires explicit user authorization and expected remote SHA.",
    schema: gitPushSchema.safeExtend({
      force: gitPushSchema.shape.force.describe(
        "Whether to force-push with a remote-SHA safety check; defaults to false. True requires explicit user authorization and expectedRemoteSha.",
      ),
      expectedRemoteSha: gitPushSchema.shape.expectedRemoteSha.describe(
        "Expected current remote branch tip: a full 40- or 64-character lowercase hexadecimal commit SHA, or null if the remote branch must not exist. Required when force is true; otherwise optional. Never invent a SHA.",
      ),
    }),
    mutation: true,
  },
  gitPull: {
    description: "Pull remote changes, optionally with rebase.",
    schema: gitPullSchema.safeExtend({
      rebase: gitPullSchema.shape.rebase.describe(
        "Use true to rebase local commits onto remote changes, or false for a normal pull; defaults to false. Follow the user's requested strategy.",
      ),
    }),
    mutation: true,
  },
  gitStashes: {
    description: "List saved stashes.",
    schema: gitStashQuerySchema.safeExtend({
      cursor: gitStashQuerySchema.shape.cursor.describe(
        "Opaque continuation cursor returned by the previous stash listing with the same search; omit for the first page. Do not invent or modify it.",
      ),
      pageSize: gitStashQuerySchema.shape.pageSize.describe(
        "Maximum stashes per page, an integer from 1 to 100; defaults to 20.",
      ),
      search: gitStashQuerySchema.shape.search.describe(
        'Stash search text, at most 200 characters; no CR, LF or NUL characters. Defaults to "" for no filter.',
      ),
    }),
    mutation: false,
  },
  gitStash: {
    description: "Save local changes as a named stash.",
    schema: gitStashPushSchema.safeExtend({
      message: gitStashPushSchema.shape.message.describe(
        "Optional descriptive stash message, 1–5000 characters after trimming; omit to use the default message.",
      ),
    }),
    mutation: true,
  },
  gitApplyStash: {
    description: "Restore a stash by index and SHA while keeping the backup.",
    schema: gitStashPopSchema.safeExtend({
      stashIndex: gitStashPopSchema.shape.stashIndex.describe(
        "Zero-based stash index from gitStashes, an integer from 0 to 10000; must identify the same entry as stashSha.",
      ),
      stashSha: gitStashPopSchema.shape.stashSha.describe(
        "Full stash SHA from gitStashes, exactly 40 or 64 lowercase hexadecimal characters; must match stashIndex to guard against stale listings.",
      ),
      restoreIndex: gitStashPopSchema.shape.restoreIndex.describe(
        "Whether to restore the stash's staged/unstaged state as well as file changes; defaults to false. The stash backup is kept either way.",
      ),
    }),
    mutation: true,
  },
  gitDeleteStash: {
    description: "Delete a stash only when explicitly requested.",
    schema: gitStashDropSchema.safeExtend({
      stashIndex: gitStashDropSchema.shape.stashIndex.describe(
        "Zero-based stash index explicitly requested for deletion, an integer from 0 to 10000; copy from gitStashes and match stashSha.",
      ),
      stashSha: gitStashDropSchema.shape.stashSha.describe(
        "Full SHA of the stash to delete from gitStashes, exactly 40 or 64 lowercase hexadecimal characters; must match stashIndex.",
      ),
    }),
    mutation: true,
  },
  gitDiscardPreview: {
    description:
      "Read changed paths and a fingerprint before an explicitly requested discard.",
    schema: empty,
    mutation: false,
  },
  gitDiscard: {
    description:
      "Discard changes only when explicitly requested; pass the exact preview fingerprint.",
    schema: gitDiscardSchema.safeExtend({
      fingerprint: gitDiscardSchema.shape.fingerprint.describe(
        "Exact fingerprint from the latest gitDiscardPreview: 64 lowercase hexadecimal characters. This identifies the reviewed changes, not a commit.",
      ),
      confirm: gitDiscardSchema.shape.confirm.describe(
        "Must be true; set only after the user explicitly requests discarding the previewed changes.",
      ),
      includeUntracked: gitDiscardSchema.shape.includeUntracked.describe(
        "Required boolean: true also deletes untracked files and requires explicit authorization; false preserves them.",
      ),
    }),
    mutation: true,
  },
  gitUndo: {
    description:
      "Undo the last commit using the user's requested mode. Hard reset requires explicit authorization.",
    schema: gitUndoSchema.safeExtend({
      mode: gitUndoSchema.shape.mode.describe(
        'Reset mode: "soft" removes the last commit but keeps changes staged; "mixed" keeps them unstaged; "hard" discards changes and requires explicit user authorization.',
      ),
    }),
    mutation: true,
  },
  gitRevert: {
    description: "Revert the last commit by creating an inverse commit.",
    schema: gitRevertSchema.safeExtend({
      mainline: gitRevertSchema.shape.mainline.describe(
        "For a merge commit, the one-based parent number to keep as mainline, an integer from 1 to 64; 1 is the first parent. Omit for a non-merge commit; do not guess the parent.",
      ),
    }),
    mutation: true,
  },
  publishRepository: {
    description:
      "Publish this project to GitHub with explicitly specified name and visibility.",
    schema: publishProjectSchema.safeExtend({
      name: publishProjectSchema.shape.name.describe(
        'Requested GitHub repository name, 1–100 characters after trimming; letters, digits, underscores, hyphens and periods only, not "." or "..".',
      ),
      description: publishProjectSchema.shape.description.describe(
        "Optional GitHub repository description, at most 350 characters after trimming; may be empty.",
      ),
      private: publishProjectSchema.shape.private.describe(
        "Required repository visibility: true for private, false for public. Use the user's explicit choice; do not guess.",
      ),
    }),
    mutation: true,
  },
} as const;
export type WorkspaceToolName = keyof typeof workspaceTools;
