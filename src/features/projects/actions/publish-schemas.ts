import { z } from "zod";
import { projectBranchNameSchema } from "./branch-schemas";
import { commitHashSchema } from "./commit-schemas";
import { gitPushedSchema } from "../server/git-push-schemas";

export const publishProjectSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Repository name is required.")
    .max(100)
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      "Use letters, numbers, periods, hyphens, or underscores.",
    )
    .refine(
      (name) => name !== "." && name !== "..",
      "Choose a valid repository name.",
    ),
  description: z
    .string()
    .trim()
    .max(350, "Keep the description under 351 characters.")
    .optional(),
  private: z.boolean(),
});
export type PublishProjectSchema = z.infer<typeof publishProjectSchema>;

export const gitPublishSchema = z.strictObject({
  url: z
    .string()
    .regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  expectedBranch: projectBranchNameSchema,
  expectedHeadSha: commitHashSchema,
});
export type GitPublishSchema = z.infer<typeof gitPublishSchema>;

export const gitPublishedSchema = z.object({
  remoteConnected: z.literal(true),
  push: gitPushedSchema.nullable(),
});
export type GitPublishedSchema = z.infer<typeof gitPublishedSchema>;

export const projectPublishedSchema = gitPublishedSchema.extend({
  repositoryId: z.string().regex(/^[1-9]\d*$/),
  repositoryUrl: z.url(),
  warning: z.string().nullable(),
});
export type ProjectPublishedSchema = z.infer<typeof projectPublishedSchema>;
