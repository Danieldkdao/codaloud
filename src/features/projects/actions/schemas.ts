import { z } from "zod";

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
