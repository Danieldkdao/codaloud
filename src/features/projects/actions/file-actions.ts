import {
  deleteProjectFileSchema,
  deleteProjectFileResponseSchema,
  type DeleteProjectFileSchema,
  type DeleteProjectFileResponseSchema,
  createProjectFileResponseSchema,
  createProjectFileSchema,
  readProjectFilesResponseSchema,
  type CreateProjectFileSchema,
  type CreateProjectFileResponseSchema,
  updateProjectFileSchema,
  updateProjectFileResponseSchema,
  type UpdateProjectFileSchema,
  type UpdateProjectFileResponseSchema,
  projectFilePathSchema,
  projectFileContentErrorSchema,
  readProjectFileContentResponseSchema,
  type ProjectFileContentSchema,
  type ProjectFileContentErrorSchema,
  saveProjectFileContentSchema,
  saveProjectFileContentResponseSchema,
  type SaveProjectFileContentSchema,
  type SaveProjectFileContentResponseSchema,
} from "./file-schemas";
import {
  readProjectFilesQuerySchema,
  readProjectFileSearchResponseSchema,
  type ReadProjectFilesQueryInput,
} from "./file-search-schemas";
import type { ReadProjectFilesActionResult } from "../types";
import { isProjectFileResultValid } from "@/features/projects/utils/is-project-file-result-valid";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import {
  createRequestHeaders,
  createSearchParams,
  fetchBase,
  isValidIds,
} from "@/lib/utils";

export const saveProjectFileContentAction = async (
  projectId: string,
  unsafeInput: SaveProjectFileContentSchema,
): Promise<SaveProjectFileContentResponseSchema> => {
  try {
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError)
      return {
        error: true,
        message: "Unable to verify your session. Please try again.",
      };
    if (!userId)
      return { error: true, message: "You must be signed in to save files." };
    if (!isValidIds(projectId))
      return { error: true, message: "Invalid project ID." };
    const input = saveProjectFileContentSchema.safeParse(unsafeInput);
    if (!input.success)
      return {
        error: true,
        message: input.error.issues[0]?.message ?? "Invalid file save request.",
      };
    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });
    if (!headers.has("Cookie"))
      return { error: true, message: "You must be signed in to save files." };
    const response = await fetchBase(
      `/api/projects/${projectId}/file-content`,
      {
        method: "PUT",
        headers,
        credentials: "omit",
        body: JSON.stringify(input.data),
      },
    );
    const result = saveProjectFileContentResponseSchema.parse(
      await response.json(),
    );
    if (result.error) return result;
    if (
      !response.ok ||
      result.data.path !== input.data.path ||
      result.data.size !==
        new TextEncoder().encode(input.data.content).byteLength
    ) {
      return {
        error: true,
        message: "Unable to confirm the save. Please try again.",
      };
    }
    return result;
  } catch {
    return {
      error: true,
      message: "Unable to confirm the save. Please try again.",
    };
  }
};

export const readProjectFileContentAction = async (
  projectId: string,
  filePath: string,
  signal?: AbortSignal,
  onFailure?: (
    failure: ProjectFileContentErrorSchema,
    retryAfter: string | null,
  ) => void,
): Promise<ProjectFileContentSchema | null> => {
  try {
    if (!isValidIds(projectId)) return null;
    const path = projectFilePathSchema.parse(filePath);
    const headers = await createRequestHeaders();
    if (!headers.has("Cookie")) return null;
    const response = await fetchBase(
      `/api/projects/${projectId}/file-content?${new URLSearchParams({ path })}`,
      {
        method: "GET",
        headers,
        credentials: "omit",
        signal,
      },
    );
    if (!response.ok) {
      // Queries can distinguish oversized files and restoration without changing
      // the shared data-or-null read contract.
      if (onFailure) {
        const failure = projectFileContentErrorSchema.safeParse(
          await response.json(),
        );
        if (failure.success)
          onFailure(failure.data, response.headers.get("Retry-After"));
      }
      return null;
    }
    const result = readProjectFileContentResponseSchema.parse(
      await response.json(),
    );
    return result.data.path === path ? result.data : null;
  } catch {
    return null;
  }
};

export const readProjectFilesAction = async <
  Input extends ReadProjectFilesQueryInput = string,
>(
  projectId: string,
  unsafeInput: Input = "" as Input,
  signal?: AbortSignal,
  onWorkspaceRestoring?: (retryAfter: string | null) => void,
  onFailure?: (status: number, retryAfter: string | null, code?: string) => void,
): Promise<ReadProjectFilesActionResult<Input> | null> => {
  try {
    if (!isValidIds(projectId)) return null;
    const input = readProjectFilesQuerySchema.parse(unsafeInput);
    const { path } = input;
    const params = createSearchParams(input);
    const headers = await createRequestHeaders({ "Cache-Control": "no-store" });
    const response = await fetchBase(
      `/api/projects/${projectId}/files?${params}`,
      {
        method: "GET",
        headers,
        credentials: "omit",
        signal,
      },
    ).catch((error: unknown) => {
      if (!signal?.aborted && !(error instanceof Error && error.name === "AbortError")) {
        onFailure?.(0, null);
      }
      throw error;
    });
    if (!response.ok) {
      // Report transient response metadata separately from the data-or-null result.
      if (!signal?.aborted && (onFailure || onWorkspaceRestoring)) {
        const failure = await response.json().catch(() => null);
        const code = typeof failure?.code === "string" ? failure.code : undefined;
        const retryAfter = response.headers.get("Retry-After");
        onFailure?.(response.status, retryAfter, code);
        if (response.status === 503 && code === "WORKSPACE_RESTORING") {
          onWorkspaceRestoring?.(retryAfter);
        }
      }
      return null;
    }
    if ("search" in input) {
      const { data } = readProjectFileSearchResponseSchema.parse(
        await response.json(),
      );
      if (
        data.files.length > input.pageSize ||
        data.totalCount < data.files.length ||
        data.files.some((entry) => path && !entry.path.startsWith(`${path}/`))
      )
        return null;
      return data as ReadProjectFilesActionResult<Input>;
    }
    const result = readProjectFilesResponseSchema.parse(await response.json());
    if (
      result.data.some(
        (entry) => entry.path !== [path, entry.name].filter(Boolean).join("/"),
      )
    )
      return null;
    return result.data as ReadProjectFilesActionResult<Input>;
  } catch {
    return null;
  }
};

export const createProjectFileAction = async (
  projectId: string,
  unsafeInput: CreateProjectFileSchema,
): Promise<CreateProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId))
      return { error: true, message: "Invalid project ID." };
    const input = createProjectFileSchema.safeParse(unsafeInput);
    if (!input.success)
      return {
        error: true,
        message:
          input.error.issues[0]?.message ?? "Invalid file or folder name.",
      };
    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify(input.data),
    });
    const result = createProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return {
        error: true,
        message:
          "Unable to confirm creation. Refresh the folder before trying again.",
      };
    }
    return result;
  } catch {
    return {
      error: true,
      message:
        "Unable to confirm creation. Refresh the folder before trying again.",
    };
  }
};

export const updateProjectFileAction = async (
  projectId: string,
  unsafeInput: UpdateProjectFileSchema,
): Promise<UpdateProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId))
      return { error: true, message: "Invalid project ID." };
    const input = updateProjectFileSchema.safeParse(unsafeInput);
    if (!input.success)
      return {
        error: true,
        message:
          input.error.issues[0]?.message ?? "Invalid file or folder name.",
      };
    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "PATCH",
      headers,
      credentials: "omit",
      body: JSON.stringify(input.data),
    });
    const result = updateProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return {
        error: true,
        message:
          "Unable to confirm update. Refresh the folder before trying again.",
      };
    }
    return result;
  } catch {
    return {
      error: true,
      message:
        "Unable to confirm update. Refresh the folder before trying again.",
    };
  }
};

export const deleteProjectFileAction = async (
  projectId: string,
  unsafeInput: DeleteProjectFileSchema,
): Promise<DeleteProjectFileResponseSchema> => {
  try {
    if (!isValidIds(projectId))
      return { error: true, message: "Invalid project ID." };
    const input = deleteProjectFileSchema.safeParse(unsafeInput);
    if (!input.success)
      return {
        error: true,
        message:
          input.error.issues[0]?.message ?? "Invalid file or folder name.",
      };
    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });
    if (!headers.has("Cookie"))
      return { error: true, message: "Sign in to delete files." };
    const response = await fetchBase(`/api/projects/${projectId}/files`, {
      method: "DELETE",
      headers,
      credentials: "omit",
      body: JSON.stringify(input.data),
    });
    const result = deleteProjectFileResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || !isProjectFileResultValid(result, input.data)) {
      return {
        error: true,
        message:
          "Unable to confirm deletion. Refresh the folder before trying again.",
      };
    }
    return result;
  } catch {
    return {
      error: true,
      message:
        "Unable to confirm deletion. Refresh the folder before trying again.",
    };
  }
};
