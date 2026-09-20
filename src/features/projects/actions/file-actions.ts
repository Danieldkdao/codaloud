import { z } from "zod";
import {
  createProjectFileSchema,
  deleteProjectFileSchema,
  updateProjectFileSchema,
  projectFilePathSchema,
  projectFileContentSchema,
  projectFileEntrySchema,
  saveProjectFileContentSchema,
  savedProjectFileContentSchema,
  type CreateProjectFileSchema,
  type DeleteProjectFileSchema,
  type UpdateProjectFileSchema,
  type SaveProjectFileContentSchema,
  type ProjectFileContentErrorSchema,
} from "./file-schemas";
import {
  readProjectFilesQuerySchema,
  type ReadProjectFilesQueryInput,
} from "./file-search-schemas";
import type { ReadProjectFilesActionResult } from "../types";
import { requireLocalProject } from "../local/access";
import { searchLocalFiles } from "../local/file-search";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";

const failure = (error: unknown): ProjectFileContentErrorSchema => ({
  error: true,
  message:
    error instanceof Error
      ? error.message
      : "Unable to access this file on the device.",
  code: error instanceof LocalWorkspaceError ? error.code : undefined,
});

const mutateFile = async <I extends object, O>(
  projectId: string,
  execute: (projectId: string, args: I) => Promise<unknown>,
  unsafeInput: I,
  input: z.ZodType<I>,
  output: z.ZodType<O>,
) => {
  try {
    const args = input.parse(unsafeInput);
    const project = await requireLocalProject(projectId);
    const data = output.parse(await execute(project.id, args));
    return {
      error: false as const,
      message: "File updated on this device.",
      data,
    };
  } catch (error) {
    return failure(error);
  }
};

export const saveProjectFileContentAction = (
  projectId: string,
  input: SaveProjectFileContentSchema,
) =>
  mutateFile(
    projectId,
    (id, args) => executeWorkspace(id, "save-file", args),
    input,
    saveProjectFileContentSchema,
    savedProjectFileContentSchema,
  );
export const createProjectFileAction = (
  projectId: string,
  input: CreateProjectFileSchema,
) =>
  mutateFile(
    projectId,
    (id, args) => executeWorkspace(id, "create-file", args),
    input,
    createProjectFileSchema,
    projectFileEntrySchema,
  );
export const updateProjectFileAction = (
  projectId: string,
  input: UpdateProjectFileSchema,
) =>
  mutateFile(
    projectId,
    (id, args) => executeWorkspace(id, "rename-file", args),
    input,
    updateProjectFileSchema,
    projectFileEntrySchema,
  );
export const deleteProjectFileAction = (
  projectId: string,
  input: DeleteProjectFileSchema,
) =>
  mutateFile(
    projectId,
    (id, args) => executeWorkspace(id, "delete-file", args),
    input,
    deleteProjectFileSchema,
    projectFileEntrySchema,
  );

export const readProjectFileContentAction = async (
  projectId: string,
  filePath: string,
  signal?: AbortSignal,
  onFailure?: (
    failure: ProjectFileContentErrorSchema,
    retryAfter: string | null,
  ) => void,
) => {
  try {
    if (signal?.aborted) return null;
    const path = projectFilePathSchema.parse(filePath);
    const project = await requireLocalProject(projectId);
    if (signal?.aborted) return null;
    const data = projectFileContentSchema.parse(
      await executeWorkspace(project.id, "read-file", { path }),
    );
    return signal?.aborted || data.path !== path ? null : data;
  } catch (error) {
    if (!signal?.aborted) onFailure?.(failure(error), null);
    return null;
  }
};

export const readProjectFilesAction = async <
  Input extends ReadProjectFilesQueryInput = string,
>(
  projectId: string,
  unsafeInput: Input = "" as Input,
  signal?: AbortSignal,
  _onWorkspaceRestoring?: (retryAfter: string | null) => void,
  onFailure?: (
    status: number,
    retryAfter: string | null,
    code?: string,
  ) => void,
): Promise<ReadProjectFilesActionResult<Input> | null> => {
  try {
    if (signal?.aborted) return null;
    const input = readProjectFilesQuerySchema.parse(unsafeInput);
    const project = await requireLocalProject(projectId);
    if (signal?.aborted) return null;
    const data =
      "search" in input
        ? await searchLocalFiles(project.id, input, signal)
        : z
            .array(projectFileEntrySchema)
            .parse(await executeWorkspace(project.id, "list-files", input));
    return signal?.aborted
      ? null
      : (data as ReadProjectFilesActionResult<Input>);
  } catch (error) {
    if (!signal?.aborted)
      onFailure?.(
        error instanceof LocalWorkspaceError && error.code === "SEARCH_EXPIRED"
          ? 410
          : 500,
        null,
        failure(error).code,
      );
    return null;
  }
};
