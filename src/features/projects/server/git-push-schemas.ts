import { z } from "zod";
import { gitCountsSchema } from "./git-schemas";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitPushSchema = z.strictObject({
  force: z.boolean().default(false),
  expectedRemoteSha: commitHashSchema.nullable().optional(),
}).refine((input) => !input.force || input.expectedRemoteSha !== undefined);
export type GitPushSchema = z.infer<typeof gitPushSchema>;
export const gitPushedSchema = z.object({
  pushed: z.literal(true), remoteBranch: projectBranchNameSchema, remoteSha: commitHashSchema,
  trackingUpdated: z.boolean(), counts: gitCountsSchema.nullable(),
});
export type GitPushedSchema = z.infer<typeof gitPushedSchema>;
