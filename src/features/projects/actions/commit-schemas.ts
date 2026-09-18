import { z } from "zod";
import { PAGE_SIZE } from "@/lib/constants";
import {
  projectBranchNameSchema,
  projectBranchSources,
} from "./branch-schemas";

export const commitSources = projectBranchSources;
export type CommitSource = (typeof commitSources)[number];
export const commitSourceSchema = z.enum(commitSources);
export type CommitSourceSchema = z.infer<typeof commitSourceSchema>;

export const commitHashSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export type CommitHashSchema = z.infer<typeof commitHashSchema>;

export const projectCommitQuerySchema = z.strictObject({
  branch: projectBranchNameSchema,
  search: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value.toLowerCase())
    .default(""),
  author: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value.toLowerCase())
    .default(""),
  pageSize: z.number().int().min(1).max(100).default(PAGE_SIZE),
  cursor: z.string().min(1).max(4096).nullish(),
});
export type ProjectCommitQuerySchema = z.infer<typeof projectCommitQuerySchema>;
export type ProjectCommitQueryInput = z.input<typeof projectCommitQuerySchema>;

export const projectCommitSchema = z.object({
  hash: commitHashSchema,
  message: z.string(),
  author: z.string(),
  authorEmail: z.string(),
  committedAt: z.iso.datetime({ offset: true }),
  parentHashes: z.array(commitHashSchema),
  isMerge: z.boolean(),
});
export type ProjectCommitSchema = z.infer<typeof projectCommitSchema>;

export const projectCommitPageSchema = z.object({
  commits: z.array(projectCommitSchema).max(100),
  snapshotSha: commitHashSchema.nullable(),
  nextCursor: z.string().max(4096).nullable(),
  // Local shallow clones cannot expose ancestry that has never been downloaded.
  isShallow: z.boolean(),
});
export type ProjectCommitPageSchema = z.infer<typeof projectCommitPageSchema>;

export const readProjectCommitsResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectCommitPageSchema,
});
export type ReadProjectCommitsResponseSchema = z.infer<
  typeof readProjectCommitsResponseSchema
>;
