import { z } from "zod";

import {
  MAX_IMPORT_FILE_BYTES,
  projectImportModes,
  type ProjectImportMode,
} from "../constants";
import { projectDirectoryPathSchema, projectFileNameSchema } from "./file-schemas";

export { projectImportModes };
export type { ProjectImportMode };

/**
 * A picker result handed back to the app. The uri is a device location the
 * session can read, never a user-typed path.
 */
export const projectImportItemSchema = z.strictObject({
  relativePath: z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (path) =>
        path
          .split("/")
          .every((part) => projectFileNameSchema.safeParse(part).success),
      "One of the uploaded names cannot be stored in a project.",
    ),
  name: projectFileNameSchema,
  uri: z
    .string()
    .min(1)
    .refine(
      (uri) => /^(file|content):\/\//i.test(uri),
      "The picked file is no longer readable.",
    ),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_IMPORT_FILE_BYTES, "One of the uploaded files is too large."),
});
export type ProjectImportItemSchema = z.infer<typeof projectImportItemSchema>;

export const importProjectFilesSchema = z.strictObject({
  directoryPath: projectDirectoryPathSchema,
  items: z.array(projectImportItemSchema).min(1, "Pick at least one file to upload."),
  mode: z.enum(projectImportModes).default("fail"),
});
export type ImportProjectFilesSchema = z.infer<typeof importProjectFilesSchema>;
export type ImportProjectFilesInput = z.input<typeof importProjectFilesSchema>;

export const importedProjectFilesSchema = z.object({
  imported: z.array(z.string()),
  replaced: z.array(z.string()),
  skipped: z.array(z.string()),
});
export type ImportedProjectFilesSchema = z.infer<
  typeof importedProjectFilesSchema
>;

export type ImportProjectFilesResult =
  | {
      error: true;
      message: string;
      code?: string;
      conflicts?: string[];
    }
  | { error: false; message: string; data: ImportedProjectFilesSchema };
