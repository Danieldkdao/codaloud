import type { ProjectImportItem } from "../lib/file-imports";
import {
  importProjectFilesSchema,
  importedProjectFilesSchema,
  type ImportProjectFilesInput,
  type ImportProjectFilesResult,
} from "./import-schemas";

/**
 * The workspace bridge reports failures as an Error carrying a stable `code`.
 * Reading it structurally keeps this module off the native bridge import, which
 * only the file operations themselves need.
 */
const failure = (error: unknown): ImportProjectFilesResult & { error: true } => ({
  error: true,
  message:
    error instanceof Error
      ? error.message
      : "Unable to upload these files on this device.",
  code:
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : undefined,
});

/**
 * Copies picked files into a project folder, then reads the listing back through
 * the native engine. A path the project cannot see is reported as a failure
 * instead of leaving the user with a folder that only looks populated.
 */
export const importProjectFilesAction = async (
  projectId: string,
  unsafeInput: ImportProjectFilesInput,
  signal?: AbortSignal,
): Promise<ImportProjectFilesResult> => {
  try {
    const input = importProjectFilesSchema.parse(unsafeInput);
    // Device lookup and folder listing both cross into the native bridge, so the
    // whole upload path loads them only when an upload actually runs.
    const { requireLocalProject } = await import("../local/access");
    const { readLocalFilePaths } = await import("../local/file-paths");
    const project = await requireLocalProject(projectId);
    if (signal?.aborted)
      return { error: true, message: "Upload cancelled.", code: "CANCELLED" };
    // expo-file-system is loaded on demand: only uploads bind the native file module.
    const { requireProjectWorkspace } = await import("../lib/workspace-paths");
    const { copyProjectImportItems, planProjectImport } =
      await import("../lib/file-imports");
    requireProjectWorkspace(project.id);

    const existingPaths = await readLocalFilePaths(project.id, signal);
    const plan = planProjectImport(
      input.items as ProjectImportItem[],
      existingPaths,
      input.mode,
      input.directoryPath,
    );
    if (plan.conflicts.length > 0)
      return {
        error: true,
        code: "IMPORT_CONFLICT",
        message: `${plan.conflicts.length} file${
          plan.conflicts.length === 1 ? "" : "s"
        } already exist in this project. Replace them or skip them.`,
        conflicts: plan.conflicts,
      };
    if (plan.write.length === 0)
      return {
        error: false,
        message: "Nothing to upload — every file already exists here.",
        data: importedProjectFilesSchema.parse({
          imported: [],
          replaced: [],
          skipped: plan.skipped,
        }),
      };

    const copied = await copyProjectImportItems({
      projectId: project.id,
      directoryPath: input.directoryPath,
      items: plan.write,
      overwrite: input.mode === "replace",
      signal,
    });
    if (copied.imported.length === 0)
      return {
        error: true,
        code: copied.canceled ? "CANCELLED" : "IMPORT_FAILED",
        message:
          copied.failed[0]?.reason ?? "Unable to copy these files into the project.",
      };

    const listedPaths = new Set(await readLocalFilePaths(project.id, signal));
    const missing = copied.imported.filter((path) => !listedPaths.has(path));
    if (missing.length > 0)
      return {
        error: true,
        code: "IMPORT_NOT_VISIBLE",
        message: `The project could not read ${missing.length} uploaded file${
          missing.length === 1 ? "" : "s"
        }. Refresh Files and try again.`,
      };

    return {
      error: false,
      message: `Uploaded ${copied.imported.length} file${
        copied.imported.length === 1 ? "" : "s"
      } to this project.`,
      data: importedProjectFilesSchema.parse({
        imported: copied.imported,
        replaced: plan.replaced,
        skipped: [...plan.skipped, ...copied.failed.map((item) => item.path)],
      }),
    };
  } catch (error) {
    return failure(error);
  }
};
