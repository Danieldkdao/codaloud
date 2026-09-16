import { z } from "zod";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitUndoModes = ["soft", "mixed", "hard"] as const;
export type GitUndoMode = (typeof gitUndoModes)[number];

export const gitUndoSchema = z.strictObject({
  mode: z.enum(gitUndoModes),
});
export type GitUndoSchema = z.infer<typeof gitUndoSchema>;

export const gitUndoneSchema = z.object({
  previousHeadSha: commitHashSchema,
  headSha: commitHashSchema,
  currentBranch: projectBranchNameSchema,
  mode: z.enum(gitUndoModes),
});
export type GitUndoneSchema = z.infer<typeof gitUndoneSchema>;
