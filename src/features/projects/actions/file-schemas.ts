import { z } from "zod";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";

export const projectFileKinds = ["file", "folder"] as const;
export type ProjectFileKind = (typeof projectFileKinds)[number];

export const projectFileNameSchema = z.string().min(1, "Enter a name.")
  .refine((name) => name.trim().length > 0 && name !== "." && name !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(name), "Use a single file or folder name without slashes.")
  .refine((name) => new TextEncoder().encode(name).length <= 255, "The name is too long.");
export type ProjectFileNameSchema = z.infer<typeof projectFileNameSchema>;

export const projectDirectoryPathSchema = z.string().max(4096)
  .refine((path) => path === "" || path.split("/").every((part) => projectFileNameSchema.safeParse(part).success), "Invalid folder path.");
export type ProjectDirectoryPathSchema = z.infer<typeof projectDirectoryPathSchema>;

export const projectFilePathSchema = projectDirectoryPathSchema.min(1, "Choose a file.");
export type ProjectFilePathSchema = z.infer<typeof projectFilePathSchema>;

export const projectFileContentSchema = z.object({
  path: projectFilePathSchema,
  content: z.string().max(MAX_PROJECT_FILE_SIZE_BYTES),
  size: z.number().int().nonnegative().max(MAX_PROJECT_FILE_SIZE_BYTES),
}).refine(({ content, size }) => new TextEncoder().encode(content).byteLength === size, "File size does not match its contents.");
export type ProjectFileContentSchema = z.infer<typeof projectFileContentSchema>;

export const projectFileContentErrorSchema = z.object({
  error: z.literal(true), message: z.string().min(1), code: z.string().optional(),
});
export type ProjectFileContentErrorSchema = z.infer<typeof projectFileContentErrorSchema>;

export const readProjectFileContentResponseSchema = z.object({
  error: z.literal(false), message: z.string(), data: projectFileContentSchema,
});
export type ReadProjectFileContentResponseSchema = z.infer<typeof readProjectFileContentResponseSchema>;

export const saveProjectFileContentSchema = z.strictObject({
  path: projectFilePathSchema,
  content: z.string().max(MAX_PROJECT_FILE_SIZE_BYTES)
    .refine((content) => new TextEncoder().encode(content).byteLength <= MAX_PROJECT_FILE_SIZE_BYTES, "File exceeds the editor size limit.")
    .refine((content) => !content.includes("\0") && new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(content)) === content, "Use valid UTF-8 text without null bytes."),
  // SHA-256 of the exact UTF-8 content last loaded or successfully saved.
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SaveProjectFileContentSchema = z.infer<typeof saveProjectFileContentSchema>;

export const savedProjectFileContentSchema = z.object({
  path: projectFilePathSchema,
  size: z.number().int().nonnegative().max(MAX_PROJECT_FILE_SIZE_BYTES),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SavedProjectFileContentSchema = z.infer<typeof savedProjectFileContentSchema>;

export const saveProjectFileContentResponseSchema = z.discriminatedUnion("error", [
  projectFileContentErrorSchema,
  z.object({ error: z.literal(false), message: z.string(), data: savedProjectFileContentSchema }),
]);
export type SaveProjectFileContentResponseSchema = z.infer<typeof saveProjectFileContentResponseSchema>;

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

export const deleteProjectFileSchema = createProjectFileSchema;
export type DeleteProjectFileSchema = z.infer<typeof deleteProjectFileSchema>;

export const deleteProjectFileResponseSchema = createProjectFileResponseSchema;
export type DeleteProjectFileResponseSchema = z.infer<typeof deleteProjectFileResponseSchema>;
