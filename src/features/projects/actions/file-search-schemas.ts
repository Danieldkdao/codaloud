import { z } from "zod";
import { projectDirectoryPathSchema, projectFilePathSchema } from "./file-schemas";
import { projectFileSearchLimits } from "../constants";

export const projectFileSearchScopes = ["all", "title", "content"] as const;
export type ProjectFileSearchScope = (typeof projectFileSearchScopes)[number];

export const projectFileSearchQuerySchema = z.strictObject({
  search: z.string().min(1).max(256).refine((value) => value.trim().length > 0 && !value.includes("\0")),
  scope: z.enum(projectFileSearchScopes).default("all"),
  path: projectDirectoryPathSchema.default(""),
  pageSize: z.coerce.number().int().min(1).max(projectFileSearchLimits.maxPageSize).default(projectFileSearchLimits.pageSize),
  cursor: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:[1-9][0-9]{0,4}:[a-f0-9]{64}$/).optional(),
});
export type ProjectFileSearchQuerySchema = z.infer<typeof projectFileSearchQuerySchema>;

export const projectFileSearchEntrySchema = z.object({
  path: projectFilePathSchema,
  titleMatches: z.boolean(),
  contentMatchCount: z.number().int().nonnegative().max(projectFileSearchLimits.maxFileBytes),
  contentSearched: z.boolean(),
});
export type ProjectFileSearchEntrySchema = z.infer<typeof projectFileSearchEntrySchema>;

export const projectFileSearchPageSchema = z.object({
  files: z.array(projectFileSearchEntrySchema).max(projectFileSearchLimits.maxPageSize),
  totalCount: z.number().int().nonnegative().max(projectFileSearchLimits.maxResults),
  nextCursor: projectFileSearchQuerySchema.shape.cursor.unwrap().nullable(),
  searchedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  skippedContentFiles: z.number().int().nonnegative(),
});
export type ProjectFileSearchPageSchema = z.infer<typeof projectFileSearchPageSchema>;
