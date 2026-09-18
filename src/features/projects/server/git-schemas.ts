import { z } from "zod";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitCountsSchema = z.object({
  currentBranch: projectBranchNameSchema.nullable(),
  headSha: commitHashSchema.nullable(),
  upstream: z.string().min(1).nullable(),
  upstreamSha: commitHashSchema.nullable(),
  outgoing: z.number().int().nonnegative().nullable(),
  incoming: z.number().int().nonnegative().nullable(),
  isShallow: z.boolean(),
  observedAt: z.iso.datetime(),
});
export type GitCountsSchema = z.infer<typeof gitCountsSchema>;
