import { Directory, File } from "expo-file-system";

import {
  projectImportModes,
  MAX_IMPORT_DEPTH,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_TOTAL_BYTES,
  importBlockedNames,
} from "../constants";
import { projectFileNameSchema } from "../actions/file-schemas";
import type { ProjectImportMode } from "../constants";
import { joinProjectPath, projectWorkspaceFile } from "./workspace-paths";

export type ProjectImportItem = {
  /** Path inside the picked selection; a plain file pick yields just its name. */
  relativePath: string;
  name: string;
  uri: string;
  size: number;
};

export type ProjectImportFailure = { path: string; reason: string };

export { projectImportModes };
export type { ProjectImportMode };

const isDirectoryEntry = (entry: File | Directory): entry is Directory =>
  typeof (entry as { list?: unknown }).list === "function";

const isBlockedName = (name: string) =>
  (importBlockedNames as readonly string[]).includes(name.toLowerCase());

/** The system picker reports a dismissal as a rejection; anything else is a real failure. */
export const isProjectPickerCancellation = (error: unknown) =>
  error instanceof Error && /cancel|dismiss/i.test(error.message);

export const pickProjectFiles = async (): Promise<
  ProjectImportItem[] | null
> => {
  const picked = await File.pickFileAsync({ multipleFiles: true });
  if (picked.canceled) return null;
  const items = (picked.result ?? []).map((file) => ({
    relativePath: file.name,
    name: file.name,
    uri: file.uri,
    size: file.size ?? 0,
  }));
  return enforceImportBudget(items);
};

export const pickProjectFolder = async (): Promise<
  ProjectImportItem[] | null
> => {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isProjectPickerCancellation(error)) return null;
    throw error;
  }
  return collectProjectImportItems(directory);
};

/**
 * Walks a picked folder into a flat list of project-relative files. The picked
 * folder itself is the container, so its own name is not part of the destination
 * path. Hidden version-control folders and names the workspace engine would
 * reject never enter the plan, so nothing is copied and then refused.
 */
export const collectProjectImportItems = (
  root: File | Directory,
): ProjectImportItem[] => {
  const collected: ProjectImportItem[] = [];
  const walk = (entry: File | Directory, prefix: string, depth: number) => {
    const name = entry.name;
    if (!name || isBlockedName(name)) return;
    if (!projectFileNameSchema.safeParse(name).success) return;
    const relativePath = joinProjectPath(prefix, name);
    if (isDirectoryEntry(entry)) {
      if (depth >= MAX_IMPORT_DEPTH)
        throw new Error(`"${relativePath}" is nested too deeply to upload.`);
      for (const child of entry.list()) walk(child, relativePath, depth + 1);
      return;
    }
    const file = entry as File;
    const size = file.size ?? 0;
    if (size > MAX_IMPORT_FILE_BYTES)
      throw new Error(
        `"${name}" is larger than ${formatImportMegabytes(MAX_IMPORT_FILE_BYTES)}.`,
      );
    collected.push({ relativePath, name, uri: file.uri, size });
    if (collected.length > MAX_IMPORT_ENTRIES)
      throw new Error(
        `An upload can hold at most ${MAX_IMPORT_ENTRIES} files.`,
      );
  };

  if (isDirectoryEntry(root)) {
    for (const child of root.list()) walk(child, "", 1);
  } else
    collected.push({
      relativePath: root.name,
      name: root.name,
      uri: root.uri,
      size: root.size ?? 0,
    });
  return enforceImportBudget(collected);
};

const enforceImportBudget = (items: ProjectImportItem[]) => {
  let bytes = 0;
  for (const item of items) {
    if (item.size > MAX_IMPORT_FILE_BYTES)
      throw new Error(
        `"${item.name}" is larger than ${formatImportMegabytes(MAX_IMPORT_FILE_BYTES)}.`,
      );
    bytes += item.size;
  }
  if (bytes > MAX_IMPORT_TOTAL_BYTES)
    throw new Error(
      `That upload is larger than ${formatImportMegabytes(MAX_IMPORT_TOTAL_BYTES)}.`,
    );
  if (items.length > MAX_IMPORT_ENTRIES)
    throw new Error(`An upload can hold at most ${MAX_IMPORT_ENTRIES} files.`);
  return items;
};

export const formatImportMegabytes = (bytes: number) =>
  `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Collisions are decided from a live path listing before anything is written.
 * `fail` refuses the whole upload, `replace` overwrites just the clashing files,
 * and `skip` keeps them and imports the rest.
 */
export const planProjectImport = (
  items: readonly ProjectImportItem[],
  existingPaths: readonly string[],
  mode: ProjectImportMode,
  directoryPath = "",
) => {
  const existing = new Set(existingPaths);
  const pending = new Set<string>();
  const write: ProjectImportItem[] = [];
  const replaced: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  for (const item of items) {
    const path = joinProjectPath(directoryPath, item.relativePath);
    const collision = existing.has(path) || pending.has(path);
    if (!collision) {
      pending.add(path);
      write.push(item);
      continue;
    }
    switch (mode) {
      case "fail":
        conflicts.push(path);
        break;
      case "replace":
        pending.add(path);
        replaced.push(path);
        write.push(item);
        break;
      case "skip":
        skipped.push(path);
        break;
      default:
        throw new Error(`Unsupported import mode: ${mode satisfies never}`);
    }
  }
  return { write, replaced, skipped, conflicts };
};

/** Copies each item into the project folder, keeping going after a single failure. */
export const copyProjectImportItems = async ({
  projectId,
  directoryPath,
  items,
  overwrite,
  signal,
}: {
  projectId: string;
  directoryPath: string;
  items: readonly ProjectImportItem[];
  overwrite: boolean;
  signal?: AbortSignal;
}) => {
  const imported: string[] = [];
  const failed: ProjectImportFailure[] = [];
  for (const item of items) {
    if (signal?.aborted) return { imported, failed, canceled: true };
    const path = joinProjectPath(directoryPath, item.relativePath);
    try {
      const destination = projectWorkspaceFile(projectId, path);
      await destination.parentDirectory.create({
        intermediates: true,
        idempotent: true,
      });
      const source = new File(item.uri);
      if (!source.exists)
        throw new Error(
          "The picked file is no longer available on this device.",
        );
      await source.copy(destination, { overwrite });
      imported.push(path);
    } catch (error) {
      failed.push({
        path,
        reason:
          error instanceof Error ? error.message : "Unable to copy this file.",
      });
    }
  }
  return { imported, failed, canceled: false };
};
