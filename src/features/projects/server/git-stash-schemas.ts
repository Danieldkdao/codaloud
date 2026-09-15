import { z } from "zod";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitStashQuerySchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  index: z.coerce.number().int().min(0).max(10000).optional(),
  stashSha: commitHashSchema.optional(),
}).refine((value) => (value.index === undefined) === (value.stashSha === undefined));
export type GitStashQuerySchema = z.infer<typeof gitStashQuerySchema>;
export const gitStashListSchema = z.object({
  stashes: z.array(z.object({ index: z.number().int().nonnegative(), sha: commitHashSchema, message: z.string(), createdAt: z.iso.datetime({ offset: true }) })).max(100),
  nextOffset: z.number().int().nonnegative().nullable(),
  patch: z.string().max(3 * 1024 * 1024).nullable(),
});
export type GitStashListSchema = z.infer<typeof gitStashListSchema>;
