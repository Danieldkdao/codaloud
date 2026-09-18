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
