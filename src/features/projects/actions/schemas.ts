import { z } from "zod";

export const createProjectSchema = z.strictObject({
  name: z
    .string({ error: "Project name must be a string." })
    .trim()
    .min(1, "Project name is required.")
    .max(100, "Project name must be 100 characters or fewer."),
});

export type CreateProjectSchema = z.infer<typeof createProjectSchema>;

export const createProjectFormSchema = createProjectSchema.extend({
  source: z.enum(["new", "github"], {
    error: "Choose how to start your project.",
  }),
});

export type CreateProjectFormSchema = z.infer<typeof createProjectFormSchema>;
