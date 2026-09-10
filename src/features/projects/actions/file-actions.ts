import {
  createProjectFileResponseSchema, createProjectFileSchema, projectDirectoryPathSchema,
  readProjectFilesResponseSchema, type CreateProjectFileSchema, type CreateProjectFileResponseSchema,
  type ProjectFileEntrySchema,
} from "./file-schemas";
import { createRequestHeaders, fetchBase, isValidIds } from "@/lib/utils";

export const readProjectFilesAction = async (
  projectId: string, directoryPath = "", signal?: AbortSignal,
): Promise<ProjectFileEntrySchema[] | null> => {
  try {
    if (!isValidIds(projectId)) return null;
    const path = projectDirectoryPathSchema.parse(directoryPath);
    const headers = await createRequestHeaders();
    const response = await fetchBase(`/api/projects/${projectId}/files?${new URLSearchParams({ path })}`, {
      method: "GET", headers, credentials: "omit", signal,
    });
    if (!response.ok) return null;
    const result = readProjectFilesResponseSchema.parse(await response.json());
    if (result.data.some((entry) => entry.path !== [path, entry.name].filter(Boolean).join("/"))) return null;
    return result.data;
  } catch { return null; }
};

export const createProjectFileAction = async (
  projectId: string, unsafeInput: CreateProjectFileSchema,
): Promise<CreateProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId)) return { error: true, message: "Invalid project ID." };
    const input = createProjectFileSchema.safeParse(unsafeInput);
    if (!input.success) return { error: true, message: input.error.issues[0]?.message ?? "Invalid file or folder name." };
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "POST", headers, credentials: "omit", body: JSON.stringify(input.data),
    });
    const result = createProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || result.data.path !== [input.data.parentPath, input.data.name].filter(Boolean).join("/") ||
      result.data.name !== input.data.name || result.data.isDir !== (input.data.kind === "folder")) {
      return { error: true, message: "Unable to confirm creation. Refresh the folder before trying again." };
    }
    return result;
  } catch {
    return { error: true, message: "Unable to confirm creation. Refresh the folder before trying again." };
  }
};
