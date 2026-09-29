import { z } from "zod";

import {
  projectFileContentSchema,
  projectFileEntrySchema,
  type ProjectFileEntrySchema,
} from "@/features/projects/actions/file-schemas";
import { requireLocalProject } from "@/features/projects/local/access";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { sha256Hex, utf8ByteLength } from "@/lib/hashes";
import {
  copyDraftToProjectSchema,
  copiedDraftFileSchema,
  type CopyDraftToProjectInput,
} from "./draft-schemas";
import { getLocalDrafts } from "../local/access";
import type { DraftCopyResult } from "../types";

const failure = (error: unknown): DraftCopyResult & { error: true } => ({
  error: true,
  message:
    error instanceof Error
      ? error.message
      : "Unable to copy this draft on the device.",
  code: error instanceof LocalWorkspaceError ? error.code : undefined,
});

const listDirectory = async (
  projectId: string,
  directoryPath: string,
): Promise<ProjectFileEntrySchema[]> =>
  z
    .array(projectFileEntrySchema)
    .parse(
      await executeWorkspace(projectId, "list-files", { path: directoryPath }),
    );

/**
 * Copies the whole draft into one project folder. An existing name is never
 * overwritten silently, and a failed write rolls its own new file back so the
 * project is left exactly as it was found.
 */
export const copyDraftToProjectAction = async (
  unsafeInput: CopyDraftToProjectInput,
): Promise<DraftCopyResult> => {
  let created: {
    projectId: string;
    directoryPath: string;
    filename: string;
  } | null = null;
  try {
    const input = copyDraftToProjectSchema.parse(unsafeInput);
    // The schema already refuses a blank or path-like name, so only edges are trimmed.
    const filename = input.filename.trim();

    const project = await requireLocalProject(input.projectId);
    const store = await getLocalDrafts();
    const draft = store.read(input.draftId.toLowerCase());
    if (!draft)
      return {
        error: true,
        message: "This draft is not on this device.",
        code: "DRAFT_NOT_FOUND",
      };

    const path =
      input.directoryPath === ""
        ? filename
        : `${input.directoryPath}/${filename}`;
    const { draftHasAsset, draftAssetFile } =
      await import("../lib/draft-assets");
    if (draftHasAsset(draft.id)) {
      const asset = draftAssetFile(draft.id);
      const { importProjectFilesAction } =
        await import("@/features/projects/actions/import-actions");
      const copiedAsset = await importProjectFilesAction(project.id, {
        directoryPath: input.directoryPath,
        items: [
          {
            relativePath: filename,
            name: filename,
            uri: asset.uri,
            size: asset.size,
          },
        ],
        mode: input.mode === "replace" ? "replace" : "fail",
      });
      if (copiedAsset.error)
        return {
          error: true,
          message: copiedAsset.message,
          code:
            copiedAsset.code === "IMPORT_CONFLICT"
              ? "FILE_EXISTS"
              : copiedAsset.code,
        };
      return {
        error: false,
        message: "Draft copied into this project.",
        data: copiedDraftFileSchema.parse({
          projectId: project.id,
          directoryPath: input.directoryPath,
          filename,
          path,
          size: asset.size,
          replaced: copiedAsset.data.replaced.includes(path),
        }),
      };
    }
    const entries = await listDirectory(project.id, input.directoryPath);
    const existingEntry = entries.find((entry) => entry.name === filename);
    if (existingEntry?.isDir)
      return {
        error: true,
        message: `A folder already uses the name "${filename}" here.`,
        code: "FILE_EXISTS",
      };
    if (existingEntry && input.mode !== "replace")
      return {
        error: true,
        message: `"${filename}" already exists in this folder.`,
        code: "FILE_EXISTS",
      };

    const size = utf8ByteLength(draft.content);
    if (!existingEntry) {
      await executeWorkspace(project.id, "create-file", {
        parentPath: input.directoryPath,
        name: filename,
        kind: "file",
      });
      // Only a file this call created is eligible for rollback.
      created = {
        projectId: project.id,
        directoryPath: input.directoryPath,
        filename,
      };
      await executeWorkspace(project.id, "save-file", {
        path,
        content: draft.content,
        expectedContentHash: sha256Hex(""),
      });
    } else {
      // Replacing requires the current text so the native layer can compare hashes;
      // a binary or oversized file is refused rather than destroyed.
      const existingFile = projectFileContentSchema.parse(
        await executeWorkspace(project.id, "read-file", { path }),
      );
      await executeWorkspace(project.id, "save-file", {
        path,
        content: draft.content,
        expectedContentHash: sha256Hex(existingFile.content),
      });
    }
    created = null;

    return {
      error: false,
      message: "Draft copied into this project.",
      data: copiedDraftFileSchema.parse({
        projectId: project.id,
        directoryPath: input.directoryPath,
        filename,
        path,
        size,
        replaced: Boolean(existingEntry),
      }),
    };
  } catch (error) {
    const rollback = created;
    if (rollback)
      await executeWorkspace(rollback.projectId, "delete-file", {
        parentPath: rollback.directoryPath,
        name: rollback.filename,
        kind: "file",
      }).catch(() => undefined);
    return failure(error);
  }
};
