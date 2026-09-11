import {
  deleteProjectFileSchema, deleteProjectFileResponseSchema,
  type DeleteProjectFileSchema, type DeleteProjectFileResponseSchema,
  createProjectFileResponseSchema, createProjectFileSchema, projectDirectoryPathSchema,
  readProjectFilesResponseSchema, type CreateProjectFileSchema, type CreateProjectFileResponseSchema,
  type ProjectFileEntrySchema,
  updateProjectFileSchema, updateProjectFileResponseSchema,
  type UpdateProjectFileSchema, type UpdateProjectFileResponseSchema,
  projectFilePathSchema, projectFileContentErrorSchema, readProjectFileContentResponseSchema,
  type ProjectFileContentSchema, type ProjectFileContentErrorSchema,
} from "./file-schemas";
import { isProjectFileResultValid } from "@/features/projects/utils/is-project-file-result-valid";
import { createRequestHeaders, fetchBase, isValidIds } from "@/lib/utils";

export const readProjectFileContentAction = async (
  projectId: string, filePath: string, signal?: AbortSignal,
  onFailure?: (failure: ProjectFileContentErrorSchema, retryAfter: string | null) => void,
): Promise<ProjectFileContentSchema | null> => {
  try {
    if (!isValidIds(projectId)) return null;
    const path = projectFilePathSchema.parse(filePath);
    const headers = await createRequestHeaders();
    if (!headers.has("Cookie")) return null;
    const response = await fetchBase(`/api/projects/${projectId}/file-content?${new URLSearchParams({ path })}`, {
      method: "GET", headers, credentials: "omit", signal,
    });
    if (!response.ok) {
      // Queries can distinguish oversized files and restoration without changing
      // the shared data-or-null read contract.
      if (onFailure) {
        const failure = projectFileContentErrorSchema.safeParse(await response.json());
        if (failure.success) onFailure(failure.data, response.headers.get("Retry-After"));
      }
      return null;
    }
    const result = readProjectFileContentResponseSchema.parse(await response.json());
    return result.data.path === path ? result.data : null;
  } catch { return null; }
};

export const readProjectFilesAction = async (
  projectId: string, directoryPath = "", signal?: AbortSignal,
  onWorkspaceRestoring?: (retryAfter: string | null) => void,
): Promise<ProjectFileEntrySchema[] | null> => {
  try {
    if (!isValidIds(projectId)) return null;
    const path = projectDirectoryPathSchema.parse(directoryPath);
    const headers = await createRequestHeaders();
    const response = await fetchBase(`/api/projects/${projectId}/files?${new URLSearchParams({ path })}`, {
      method: "GET", headers, credentials: "omit", signal,
    });
    if (!response.ok) {
      // Report transient response metadata separately from the data-or-null result.
      if (response.status === 503 && onWorkspaceRestoring) {
        const failure = await response.json();
        if (failure?.code === "WORKSPACE_RESTORING") {
          onWorkspaceRestoring(response.headers.get("Retry-After"));
        }
      }
      return null;
    }
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
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return { error: true, message: "Unable to confirm creation. Refresh the folder before trying again." };
    }
    return result;
  } catch {
    return { error: true, message: "Unable to confirm creation. Refresh the folder before trying again." };
  }
};

export const updateProjectFileAction = async (
  projectId: string, unsafeInput: UpdateProjectFileSchema,
): Promise<UpdateProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId)) return { error: true, message: "Invalid project ID." };
    const input = updateProjectFileSchema.safeParse(unsafeInput);
    if (!input.success) return { error: true, message: input.error.issues[0]?.message ?? "Invalid file or folder name." };
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "PATCH", headers, credentials: "omit", body: JSON.stringify(input.data),
    });
    const result = updateProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return { error: true, message: "Unable to confirm update. Refresh the folder before trying again." };
    }
    return result;
  } catch {
    return { error: true, message: "Unable to confirm update. Refresh the folder before trying again." };
  }
};

export const deleteProjectFileAction = async (
  projectId: string, unsafeInput: DeleteProjectFileSchema,
): Promise<DeleteProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId)) return { error: true, message: "Invalid project ID." };
    const input = deleteProjectFileSchema.safeParse(unsafeInput);
    if (!input.success) return { error: true, message: input.error.issues[0]?.message ?? "Invalid file or folder name." };
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.has("Cookie")) return { error: true, message: "Sign in to delete files." };
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "DELETE", headers, credentials: "omit", body: JSON.stringify(input.data),
    });
    const result = deleteProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return { error: true, message: "Unable to confirm deletion. Refresh the folder before trying again." };
    }
    return result;
  } catch {
    return { error: true, message: "Unable to confirm deletion. Refresh the folder before trying again." };
  }
};
