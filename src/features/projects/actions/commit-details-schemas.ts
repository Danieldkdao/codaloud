import { z } from "zod";
import { commitHashSchema, commitSourceSchema, projectCommitSchema } from "./commit-schemas";
import { projectChangeDiffSchema, projectChangePathSchema } from "./change-schemas";
import { projectCommitDetailsLimits } from "../constants";

export const projectCommitDetailsParamsSchema = z.strictObject({
  projectId: z.uuid(),
  commitSha: commitHashSchema,
  source: commitSourceSchema,
});
export type ProjectCommitDetailsParamsSchema = z.infer<typeof projectCommitDetailsParamsSchema>;

export const projectCommitFileStatuses = ["added", "deleted", "modified", "renamed", "copied", "type-changed"] as const;
export type ProjectCommitFileStatus = (typeof projectCommitFileStatuses)[number];
export const projectCommitFileSchema = z.object({
  path: projectChangePathSchema,
  originalPath: projectChangePathSchema.nullable(),
  status: z.enum(projectCommitFileStatuses),
  // GitHub's commit response does not expose file modes.
  beforeMode: z.string().regex(/^(?:000000|100644|100755|120000|160000)$/).nullable(),
  afterMode: z.string().regex(/^(?:000000|100644|100755|120000|160000)$/).nullable(),
  diff: projectChangeDiffSchema,
});
export type ProjectCommitFileSchema = z.infer<typeof projectCommitFileSchema>;

export const projectCommitDetailsSchema = z.object({
  source: commitSourceSchema,
  commit: projectCommitSchema.extend({
    authoredAt: z.iso.datetime({ offset: true }),
    committer: z.string(),
    committerEmail: z.string(),
  }),
  // Null only for a root commit; merge commits compare against the first parent.
  baseSha: commitHashSchema.nullable(),
  files: z.array(projectCommitFileSchema).max(projectCommitDetailsLimits.maxFiles),
  summary: z.object({
    fileCount: z.number().int().nonnegative(),
    // Counts cover validated text previews; unavailableCount discloses omissions.
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    unavailableCount: z.number().int().nonnegative(),
  }),
  githubUrl: z.url().nullable(),
});
export type ProjectCommitDetailsSchema = z.infer<typeof projectCommitDetailsSchema>;

export const readProjectCommitDetailsResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectCommitDetailsSchema,
});
export type ReadProjectCommitDetailsResponseSchema = z.infer<typeof readProjectCommitDetailsResponseSchema>;
