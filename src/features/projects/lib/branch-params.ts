import { z } from "zod";
import { paginationSchema } from "@/lib/schemas";

export const projectBranchCursorSchema = z.strictObject({
  version: z.literal(1),
  projectId: z.uuid(),
  search: z.string().max(200),
  after: z.string().min(1),
});
export type ProjectBranchCursorSchema = z.infer<typeof projectBranchCursorSchema>;

export const readProjectBranchCursor = (token: string): ProjectBranchCursorSchema | null => {
  if (token.length > 16384) return null;
  try {
    const result = projectBranchCursorSchema.safeParse(JSON.parse(token));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const projectBranchCursorTokenSchema = z.string().min(1).max(16384).refine(
  (token) => readProjectBranchCursor(token) !== null,
  "Invalid branch cursor. Start a new branch search.",
);
export type ProjectBranchCursorTokenSchema = z.infer<typeof projectBranchCursorTokenSchema>;

export const projectBranchParamsSchema = z.strictObject({
  projectId: z.uuid(),
  search: paginationSchema.shape.search.default("")
    .transform((search) => search.toLowerCase())
    .pipe(paginationSchema.shape.search.unwrap()),
  cursor: projectBranchCursorTokenSchema.nullish(),
  pageSize: paginationSchema.shape.pageSize,
}).superRefine(({ projectId, search, cursor }, ctx) => {
  if (!cursor) return;
  const position = readProjectBranchCursor(cursor);
  if (position && (position.projectId !== projectId || position.search !== search)) {
    ctx.addIssue({ code: "custom", message: "Cursor does not match the current project and search.", path: ["cursor"] });
  }
});
export type ProjectBranchParamsSchema = z.infer<typeof projectBranchParamsSchema>;
