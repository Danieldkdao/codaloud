import { z } from "zod";
import { projectChangePathSchema } from "./change-schemas";
import { projectBranchNameSchema } from "./branch-schemas";
import { commitHashSchema } from "./commit-schemas";

export const projectCommitMessageSchema = z
  .string()
  .trim()
  .min(1, "Enter a commit message.")
  .max(5000, "Keep the commit message within 5,000 characters.")
  .refine(
    (message) => !message.includes("\0"),
    "Commit messages cannot contain null characters.",
  );
export type ProjectCommitMessageSchema = z.infer<
  typeof projectCommitMessageSchema
>;

export const createProjectCommitSchema = z.strictObject({
  message: projectCommitMessageSchema,
  // Preserve exact path identities; repository membership is checked separately.
  paths: z
    .array(projectChangePathSchema)
    .min(1, "Select at least one changed file.")
    .max(5000, "Select no more than 5,000 changed files.")
    .refine(
      (paths) => new Set(paths).size === paths.length,
      "Select each path only once.",
    ),
});
export type CreateProjectCommitSchema = z.infer<
  typeof createProjectCommitSchema
>;

export const projectCreatedCommitSchema = z.object({
  hash: commitHashSchema,
  currentBranch: projectBranchNameSchema,
  parentHash: commitHashSchema.nullable(),
});
export type ProjectCreatedCommitSchema = z.infer<
  typeof projectCreatedCommitSchema
>;

export const createProjectCommitResponseSchema = z.discriminatedUnion("error", [
  z.object({
    error: z.literal(true),
    message: z.string().min(1),
    code: z.string().min(1).optional(),
  }),
  z.object({
    error: z.literal(false),
    message: z.string().min(1),
    data: projectCreatedCommitSchema,
  }),
]);
export type CreateProjectCommitResponseSchema = z.infer<
  typeof createProjectCommitResponseSchema
>;
