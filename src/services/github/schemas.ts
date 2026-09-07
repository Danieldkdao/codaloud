import { z } from "zod";
import { paginationSchema } from "@/lib/schemas";
import { GITHUB_CURSOR_MAX_LENGTH } from "./constants";

export const gitHubRepositoryRequestSchema = z.object({
  search: paginationSchema.shape.search,
  pageSize: paginationSchema.shape.pageSize,
  cursor: z.string()
    .min(1, "Invalid repository cursor.")
    .max(GITHUB_CURSOR_MAX_LENGTH, "Invalid repository cursor.")
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid repository cursor.")
    .nullish(),
});
export type GitHubRepositoryRequestSchema = z.infer<typeof gitHubRepositoryRequestSchema>;

export const gitHubRepositorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  archived: z.boolean(),
  defaultBranch: z.string(),
  cloneUrl: z.string(),
  htmlUrl: z.string(),
  permissions: z.object({ pull: z.boolean(), push: z.boolean(), admin: z.boolean() }),
});
export type GitHubRepositorySchema = z.infer<typeof gitHubRepositorySchema>;

export const gitHubRepositoryPageSchema = z.object({
  repositories: z.array(gitHubRepositorySchema),
  // Null marks exhaustion; sparse searches can have an empty page and a cursor.
  nextCursor: z.string().min(1).max(GITHUB_CURSOR_MAX_LENGTH).nullable(),
});
export type GitHubRepositoryPageSchema = z.infer<typeof gitHubRepositoryPageSchema>;
