import { z } from "zod";
import { commitHashSchema } from "./commit-schemas";

export const projectRepositoryStates = [
  "ready",
  "unborn",
  "not-initialized",
] as const;
export type ProjectRepositoryState = (typeof projectRepositoryStates)[number];
export const projectGitFileStates = [
  "unchanged",
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "type-changed",
  "unmerged",
  "untracked",
] as const;
export type ProjectGitFileState = (typeof projectGitFileStates)[number];
export const projectChangeKinds = ["file", "symlink", "submodule"] as const;
export type ProjectChangeKind = (typeof projectChangeKinds)[number];
export const projectDiffUnavailableReasons = [
  "binary",
  "too-large",
  "unsupported",
  "conflict",
] as const;
export type ProjectDiffUnavailableReason =
  (typeof projectDiffUnavailableReasons)[number];

// Git permits newlines and backslashes in names. These paths are identities, not
// editor inputs or shell arguments; retain them without trimming or normalizing.
export const projectChangePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.includes("\0") &&
      value
        .split("/")
        .every(
          (part) =>
            part &&
            part !== "." &&
            part !== ".." &&
            part.toLowerCase() !== ".git",
        ),
  );
export type ProjectChangePathSchema = z.infer<typeof projectChangePathSchema>;

export const projectChangeDiffSchema = z.union([
  z.object({
    patch: z.string().max(256 * 1024),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    unavailableReason: z.null(),
  }),
  z.object({
    patch: z.null(),
    additions: z.null(),
    deletions: z.null(),
    unavailableReason: z.enum(projectDiffUnavailableReasons),
  }),
]);
export type ProjectChangeDiffSchema = z.infer<typeof projectChangeDiffSchema>;

export const projectRepositoryChangeSchema = z.object({
  path: projectChangePathSchema,
  originalPath: projectChangePathSchema.nullable(),
  indexStatus: z.enum(projectGitFileStates),
  worktreeStatus: z.enum(projectGitFileStates),
  isUntracked: z.boolean(),
  isConflicted: z.boolean(),
  kind: z.enum(projectChangeKinds),
  headMode: z.string().regex(/^[0-7]{6}$/),
  indexMode: z.string().regex(/^[0-7]{6}$/),
  worktreeMode: z.string().regex(/^[0-7]{6}$/),
  staged: projectChangeDiffSchema.nullable(),
  unstaged: projectChangeDiffSchema.nullable(),
});
export type ProjectRepositoryChangeSchema = z.infer<
  typeof projectRepositoryChangeSchema
>;

export const projectRepositoryChangesSchema = z.object({
  repositoryState: z.enum(projectRepositoryStates),
  currentBranch: z.string().min(1).max(1024).nullable(),
  headSha: commitHashSchema.nullable(),
  isDetached: z.boolean(),
  observedAt: z.iso.datetime({ offset: true }),
  changes: z.array(projectRepositoryChangeSchema).max(5000),
});
export type ProjectRepositoryChangesSchema = z.infer<
  typeof projectRepositoryChangesSchema
>;
