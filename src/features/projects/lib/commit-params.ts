import { z } from "zod";
import { paginationSchema } from "@/lib/schemas";
import { commitSourceSchema, projectCommitQuerySchema } from "../actions/commit-schemas";

// HTTP page sizes arrive as strings; keep the readers' numeric contract unchanged.
export const projectCommitParamsSchema = projectCommitQuerySchema.extend({
  projectId: z.uuid(),
  source: commitSourceSchema,
  pageSize: paginationSchema.shape.pageSize,
});
export type ProjectCommitParamsSchema = z.infer<typeof projectCommitParamsSchema>;

export const getProjectCommitDiffParams = (commitSha: unknown, source: unknown) => {
  if (typeof commitSha !== "string" || !commitSha.trim() || (source !== "local" && source !== "remote")) return null;
  return { commitSha, source } as const;
};
