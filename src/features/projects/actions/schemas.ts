import { z } from "zod";

import { projectSetupStatuses } from "@/db/shared";
import { projectCursorTokenSchema } from "@/features/projects/lib/project-params";
import type { ProjectPageData, ProjectResponseData } from "@/features/projects/types";

// Validate the JSON representation, including timestamps serialized by the API.
export const projectResponseSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  sandboxId: z.string().nullable(),
  setupStatus: z.enum(projectSetupStatuses),
  setupError: z.string().nullable(),
  githubRepositoryId: z.string().nullable(),
  lastOpenedFilePath: z.string().nullable(),
  lastOpenedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) satisfies z.ZodType<ProjectResponseData>;

export type ProjectResponseSchema = z.infer<typeof projectResponseSchema>;

export const readProjectResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectResponseSchema,
});

export type ReadProjectResponseSchema = z.infer<typeof readProjectResponseSchema>;

export const projectPageSchema = z.object({
  projects: z.array(projectResponseSchema),
  nextCursor: projectCursorTokenSchema.nullable(),
}).refine(
  (page) => page.nextCursor === null || page.projects.length > 0,
  "An empty project page cannot have a continuation cursor.",
) satisfies z.ZodType<ProjectPageData>;

export type ProjectPageSchema = z.infer<typeof projectPageSchema>;

export const readProjectsResponseSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: projectPageSchema,
});

export type ReadProjectsResponseSchema = z.infer<typeof readProjectsResponseSchema>;

const projectFields = {
  name: z
    .string({ error: "Project name must be a string." })
    .trim()
    .min(1, "Project name is required.")
    .max(100, "Project name must be 100 characters or fewer."),
};

export const createProjectSchema = z.discriminatedUnion(
  "source",
  [
    z.strictObject({ ...projectFields, source: z.literal("new") }),
    z.strictObject({
      ...projectFields,
      source: z.literal("github"),
      repositoryId: z
        .string({ error: "Select a GitHub repository." })
        .regex(/^[1-9]\d*$/, "Select a GitHub repository."),
    }),
  ],
  { error: "Choose how to start your project." },
);

export type CreateProjectSchema = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.strictObject(projectFields).partial().refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  "Provide at least one field to update.",
);

export type UpdateProjectSchema = z.infer<typeof updateProjectSchema>;

export const createProjectFormSchema = createProjectSchema;

export type CreateProjectFormSchema = z.infer<typeof createProjectFormSchema>;

export const createProjectResponseSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal(true), message: z.string().trim().min(1), code: z.string().optional() }),
  z.object({
    error: z.literal(false),
    message: z.string().trim().min(1),
    data: z.object({ id: z.string().trim().min(1) }),
  }),
]);

export type CreateProjectResponseSchema = z.infer<typeof createProjectResponseSchema>;

export const updateProjectResponseSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal(true), message: z.string().trim().min(1), code: z.string().optional() }),
  readProjectResponseSchema.extend({ message: z.string().trim().min(1) }),
]);

export type UpdateProjectResponseSchema = z.infer<typeof updateProjectResponseSchema>;

export const deleteProjectResponseSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal(true), message: z.string().trim().min(1), code: z.string().optional() }),
  readProjectResponseSchema.extend({ message: z.string().trim().min(1) }),
]);

export type DeleteProjectResponseSchema = z.infer<typeof deleteProjectResponseSchema>;
