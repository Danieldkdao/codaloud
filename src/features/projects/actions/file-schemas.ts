import { z } from "zod";

export const projectFileKinds = ["file", "folder"] as const;
export type ProjectFileKind = (typeof projectFileKinds)[number];

export const projectFileNameSchema = z.string().min(1, "Enter a name.")
  .refine((name) => name.trim().length > 0 && name !== "." && name !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(name), "Use a single file or folder name without slashes.")
  .refine((name) => new TextEncoder().encode(name).length <= 255, "The name is too long.");
export type ProjectFileNameSchema = z.infer<typeof projectFileNameSchema>;

export const projectDirectoryPathSchema = z.string().max(4096)
  .refine((path) => path === "" || path.split("/").every((part) => projectFileNameSchema.safeParse(part).success), "Invalid folder path.");
export type ProjectDirectoryPathSchema = z.infer<typeof projectDirectoryPathSchema>;

export const createProjectFileSchema = z.strictObject({
  parentPath: projectDirectoryPathSchema,
  name: projectFileNameSchema,
  kind: z.enum(projectFileKinds),
});
export type CreateProjectFileSchema = z.infer<typeof createProjectFileSchema>;

export const updateProjectFileSchema = createProjectFileSchema.extend({
  previousName: projectFileNameSchema,
});
export type UpdateProjectFileSchema = z.infer<typeof updateProjectFileSchema>;

export const projectFileEntrySchema = z.object({
  name: projectFileNameSchema,
  path: projectDirectoryPathSchema,
  isDir: z.boolean(),
  size: z.number().nonnegative(),
  modifiedAt: z.string().optional(),
});
export type ProjectFileEntrySchema = z.infer<typeof projectFileEntrySchema>;

export const readProjectFilesResponseSchema = z.object({
  error: z.literal(false), message: z.string(), data: z.array(projectFileEntrySchema),
});
export type ReadProjectFilesResponseSchema = z.infer<typeof readProjectFilesResponseSchema>;

export const createProjectFileResponseSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal(true), message: z.string().min(1), code: z.string().optional() }),
  z.object({ error: z.literal(false), message: z.string(), data: projectFileEntrySchema }),
]);
export type CreateProjectFileResponseSchema = z.infer<typeof createProjectFileResponseSchema>;

export const updateProjectFileResponseSchema = createProjectFileResponseSchema;
export type UpdateProjectFileResponseSchema = z.infer<typeof updateProjectFileResponseSchema>;
