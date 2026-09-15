import { z } from "zod";
import { commitHashSchema } from "../actions/commit-schemas";
import { gitExpectedStateSchema } from "./git-schemas";

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

export const gitStashPushSchema = gitExpectedStateSchema.extend({ message: z.string().trim().min(1).max(5000).optional() });
export type GitStashPushSchema = z.infer<typeof gitStashPushSchema>;
export const gitStashPushedSchema = z.object({ created: z.boolean(), remainingChanges: z.boolean(), stashSha: commitHashSchema.nullable() });
export type GitStashPushedSchema = z.infer<typeof gitStashPushedSchema>;

export const gitStashPopSchema = gitExpectedStateSchema.extend({
  stashIndex: z.number().int().min(0).max(10000), stashSha: commitHashSchema, restoreIndex: z.boolean().default(false),
});
export type GitStashPopSchema = z.infer<typeof gitStashPopSchema>;
export const gitStashPoppedSchema = z.object({ stashSha: commitHashSchema, dropped: z.literal(true) });
export type GitStashPoppedSchema = z.infer<typeof gitStashPoppedSchema>;
