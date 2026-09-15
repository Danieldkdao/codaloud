import { z } from "zod";
import { gitCountsSchema } from "./git-schemas";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitPullSchema = z.strictObject({ rebase: z.boolean().default(false) });
export type GitPullSchema = z.infer<typeof gitPullSchema>;
export const gitPulledSchema = z.object({
  previousHeadSha: commitHashSchema, headSha: commitHashSchema, currentBranch: projectBranchNameSchema,
  rebased: z.boolean(), counts: gitCountsSchema.nullable(),
});
export type GitPulledSchema = z.infer<typeof gitPulledSchema>;
