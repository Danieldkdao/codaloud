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
  readFile: {
    description:
      "Read a bounded text file excerpt and its hash. Lines are one-based. Read before editing.",
    schema: z.strictObject({
      path: projectFilePathSchema,
      startLine: z.number().int().min(1).default(1),
      lineCount: z.number().int().min(1).max(150).default(100),
    }),
    mutation: false,
  },
  listFiles: {
    description:
      "List a folder and file sizes. Empty path lists the project root.",
    schema: z.strictObject({ path: projectDirectoryPathSchema.default("") }),
    mutation: false,
  },
  searchFiles: {
    description:
      "Search project filenames or contents. Returns paths to read, not entire files.",
    schema: projectFileSearchQuerySchema,
    mutation: false,
  },
  saveFile: {
    description:
      "Replace a small file after reading all its content, with the exact hash from readFile. Files over 8000 characters require editFile.",
    schema: saveProjectFileContentSchema,
    mutation: true,
  },
  editFile: {
    description:
      "Replace one unique exact text excerpt, preserving the rest of the file. Pass the file hash from readFile. Preferred for targeted edits and large files.",
    schema: saveProjectFileContentSchema
      .pick({ path: true, expectedContentHash: true })
      .extend({
        oldText: z.string().min(1).max(8000),
        newText: z.string().max(10000),
      }),
    mutation: true,
  },
  createFile: {
    description: "Create a file or folder inside the project.",
    schema: createProjectFileSchema,
    mutation: true,
  },
  renameFile: {
    description: "Rename a file or folder inside its parent.",
    schema: updateProjectFileSchema,
    mutation: true,
  },
  deleteFile: {
    description:
      "Delete a file or folder only when explicitly requested by the user.",
    schema: deleteProjectFileSchema,
    mutation: true,
  },
  gitBranches: {
    description: "List local and remote branch names with bounded pagination.",
    schema: z.strictObject({
      search: z.string().max(200).default(""),
      pageSize: z.number().int().min(1).max(50).default(20),
      cursor: projectBranchParamsSchema.shape.cursor,
    }),
    mutation: false,
  },
  gitHistory: {
    description: "Read a bounded page of commit history.",
    schema: projectCommitQuerySchema.extend({ source: commitSourceSchema }),
    mutation: false,
  },
  gitCommitDetails: {
    description: "Inspect a commit and its changes.",
    schema: projectCommitDetailsParamsSchema.omit({ projectId: true }),
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
    schema: createProjectCommitSchema,
    mutation: true,
  },
  gitCheckout: {
    description: "Switch to an existing branch.",
    schema: checkoutProjectBranchSchema,
    mutation: true,
  },
  gitCreateBranch: {
    description: "Create and switch to a new branch.",
    schema: gitCreateBranchSchema,
    mutation: true,
  },
  gitDeleteBranch: {
    description:
      "Delete a branch only when requested. Force requires explicit user authorization.",
    schema: gitDeleteBranchSchema,
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
    schema: gitPushSchema,
    mutation: true,
  },
  gitPull: {
    description: "Pull remote changes, optionally with rebase.",
    schema: gitPullSchema,
    mutation: true,
  },
  gitStashes: {
    description: "List saved stashes.",
    schema: gitStashQuerySchema,
    mutation: false,
  },
  gitStash: {
    description: "Save local changes as a named stash.",
    schema: gitStashPushSchema,
    mutation: true,
  },
  gitApplyStash: {
    description: "Restore a stash by index and SHA while keeping the backup.",
    schema: gitStashPopSchema,
    mutation: true,
  },
  gitDeleteStash: {
    description: "Delete a stash only when explicitly requested.",
    schema: gitStashDropSchema,
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
    schema: gitDiscardSchema,
    mutation: true,
  },
  gitUndo: {
    description:
      "Undo the last commit using the user's requested mode. Hard reset requires explicit authorization.",
    schema: gitUndoSchema,
    mutation: true,
  },
  gitRevert: {
    description: "Revert the last commit by creating an inverse commit.",
    schema: gitRevertSchema,
    mutation: true,
  },
  publishRepository: {
    description:
      "Publish this project to GitHub with explicitly specified name and visibility.",
    schema: publishProjectSchema,
    mutation: true,
  },
} as const;
export type WorkspaceToolName = keyof typeof workspaceTools;
