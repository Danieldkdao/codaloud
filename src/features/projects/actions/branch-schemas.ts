import { z } from "zod";

export const projectBranchesSchema = z.object({
  branches: z.array(z.string().min(1)),
  currentBranch: z.string().min(1).nullable(),
});
export type ProjectBranchesSchema = z.infer<typeof projectBranchesSchema>;
