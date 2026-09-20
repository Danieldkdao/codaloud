import { z } from "zod";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitCreateBranchSchema = z.strictObject({
  branchName: projectBranchNameSchema,
});
export type GitCreateBranchSchema = z.infer<typeof gitCreateBranchSchema>;
export const gitCreatedBranchSchema = z.object({
  previousBranch: projectBranchNameSchema,
  currentBranch: projectBranchNameSchema,
  headSha: commitHashSchema,
});
export type GitCreatedBranchSchema = z.infer<typeof gitCreatedBranchSchema>;

export const gitDeleteBranchSchema = z.strictObject({
  branchName: projectBranchNameSchema,
});
export type GitDeleteBranchSchema = z.infer<typeof gitDeleteBranchSchema>;
export const gitDeletedBranchSchema = z.object({
  branchName: projectBranchNameSchema,
  deleted: z.literal(true),
});
export type GitDeletedBranchSchema = z.infer<typeof gitDeletedBranchSchema>;
