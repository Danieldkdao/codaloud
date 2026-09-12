import { z } from "zod";
import { projectBranchCursorTokenSchema } from "../lib/branch-params";

export const projectBranchesSchema = z.object({
  branches: z.array(z.string().min(1)),
  currentBranch: z.string().min(1).nullable(),
});
export type ProjectBranchesSchema = z.infer<typeof projectBranchesSchema>;

export const projectBranchPageSchema = projectBranchesSchema.extend({
  nextCursor: projectBranchCursorTokenSchema.nullable(),
}).refine(
  (page) => page.nextCursor === null || page.branches.length > 0,
  "An empty branch page cannot have a continuation cursor.",
);
export type ProjectBranchPageSchema = z.infer<typeof projectBranchPageSchema>;

export const readProjectBranchesResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectBranchPageSchema,
});
export type ReadProjectBranchesResponseSchema = z.infer<
  typeof readProjectBranchesResponseSchema
>;
