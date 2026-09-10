import {
  createProjectFormSchema,
  createProjectResponseSchema,
  deleteProjectResponseSchema,
  readProjectResponseSchema,
  readProjectsResponseSchema,
  updateProjectResponseSchema,
  updateProjectSchema,
  type CreateProjectFormSchema,
  type UpdateProjectSchema,
} from "@/features/projects/actions/schemas";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";
import type { ProjectPageData, ProjectResponseData } from "@/features/projects/types";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import { createRequestHeaders, createSearchParams, fetchBase, isValidIds } from "@/lib/utils";

export const readProjectAction = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectResponseData | null> => {
  try {
    if (!isValidIds(projectId)) return null;

    const headers = await createRequestHeaders();
    const response = await fetchBase(`/api/projects/${projectId}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const result = readProjectResponseSchema.safeParse(payload);
    if (!result.success) return null;
    if (result.data.data.id.toLowerCase() !== projectId.toLowerCase()) return null;

    return result.data.data;
  } catch {
    return null;
  }
};

export const readUserProjectsAction = async (
  params: Partial<ProjectParamsSchema> = {},
  signal?: AbortSignal,
): Promise<ProjectPageData | null> => {
  try {
    const validatedParams = projectParamsSchema.safeParse(params);
    if (!validatedParams.success) return null;

    const query = createSearchParams(validatedParams.data);
    const headers = await createRequestHeaders();

    const response = await fetchBase(`/api/projects?${query}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const result = readProjectsResponseSchema.safeParse(payload);
    if (!result.success) return null;

    const { nextCursor } = result.data.data;
    if (nextCursor !== null && (
      nextCursor === validatedParams.data.cursor ||
      !projectParamsSchema.safeParse({ ...validatedParams.data, cursor: nextCursor }).success
    )) return null;

    return result.data.data;
  } catch {
    return null;
  }
};

export const createProjectAction = async (unsafeData: CreateProjectFormSchema) => {
  try {
    const { userId, error: sessionError } = await getCurrentUserClient();

    if (sessionError) {
      return {
        error: true as const,
        message: "Unable to verify your session. Please try again.",
      };
    }

    if (!userId) {
      return {
        error: true as const,
        message: "You must be signed in to create a project.",
      };
    }

    const validatedData = createProjectFormSchema.safeParse(unsafeData);
    if (!validatedData.success) {
      return {
        error: true as const,
        message: validatedData.error.issues[0]?.message ?? "Invalid project data.",
      };
    }

    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });

    const response = await fetchBase("/api/projects", {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify(validatedData.data),
    });

    const payload: unknown = await response.json();
    const result = createProjectResponseSchema.safeParse(payload);
    if (!result.success) {
      return {
        error: true as const,
        message: "The server returned an invalid project response.",
      };
    }

    if (result.data.error) {
      return result.data;
    }

    if (!response.ok) {
      return {
        error: true as const,
        message: "Unable to create project. Please try again.",
      };
    }

    return {
      error: false as const,
      message: result.data.message,
      projectId: result.data.data.id,
    };
  } catch {
    return {
      error: true as const,
      message: "Unable to create project. Please try again.",
    };
  }
};

export const updateProjectAction = async (
  projectId: string,
  unsafeData: UpdateProjectSchema,
) => {
  try {
    const { userId, error: sessionError } = await getCurrentUserClient();

    if (sessionError) {
      return {
        error: true as const,
        message: "Unable to verify your session. Please try again.",
      };
    }

    if (!userId) {
      return {
        error: true as const,
        message: "You must be signed in to update a project.",
      };
    }

    if (!isValidIds(userId)) {
      return {
        error: true as const,
        message: "Unable to verify your session. Please try again.",
      };
    }

    if (!isValidIds(projectId)) {
      return { error: true as const, message: "Invalid project ID." };
    }

    const validatedData = updateProjectSchema.safeParse(unsafeData);
    if (!validatedData.success) {
      return {
        error: true as const,
        message: validatedData.error.issues[0]?.message ?? "Invalid project data.",
      };
    }

    const headers = await createRequestHeaders({
      "Content-Type": "application/json",
    });
    const response = await fetchBase(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers,
      credentials: "omit",
      body: JSON.stringify(validatedData.data),
    });

    const payload: unknown = await response.json();
    const result = updateProjectResponseSchema.safeParse(payload);
    if (!result.success) {
      return {
        error: true as const,
        message: "The server returned an invalid project response.",
      };
    }

    if (result.data.error) {
      return result.data;
    }

    if (!response.ok) {
      return {
        error: true as const,
        message: "Unable to update project. Please try again.",
      };
    }

    const updatedProject = result.data.data;
    if (
      updatedProject.id.toLowerCase() !== projectId.toLowerCase() ||
      updatedProject.userId.toLowerCase() !== userId.toLowerCase()
    ) {
      return {
        error: true as const,
        message: "The server returned an invalid project response.",
      };
    }

    return {
      error: false as const,
      message: result.data.message,
      projectId: updatedProject.id,
    };
  } catch {
    return {
      error: true as const,
      message: "Unable to update project. Please try again.",
    };
  }
};

export const deleteProjectAction = async (projectId: string) => {
  try {
    const { userId, error: sessionError } = await getCurrentUserClient();

    if (sessionError) {
      return {
        error: true as const,
        message: "Unable to verify your session. Please try again.",
      };
    }

    if (!userId) {
      return {
        error: true as const,
        message: "You must be signed in to delete a project.",
      };
    }

    if (!isValidIds(userId)) {
      return {
        error: true as const,
        message: "Unable to verify your session. Please try again.",
      };
    }

    if (!isValidIds(projectId)) {
      return { error: true as const, message: "Invalid project ID." };
    }

    const headers = await createRequestHeaders();
    const response = await fetchBase(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers,
      credentials: "omit",
    });

    const payload: unknown = await response.json();
    const result = deleteProjectResponseSchema.safeParse(payload);
    if (!result.success) {
      return {
        error: true as const,
        message: "The server returned an invalid project response.",
      };
    }

    if (result.data.error) {
      return result.data;
    }

    if (!response.ok) {
      return {
        error: true as const,
        message: "Unable to delete project. Please try again.",
      };
    }

    const deletedProject = result.data.data;
    if (
      deletedProject.id.toLowerCase() !== projectId.toLowerCase() ||
      deletedProject.userId.toLowerCase() !== userId.toLowerCase()
    ) {
      return {
        error: true as const,
        message: "The server returned an invalid project response.",
      };
    }

    return {
      error: false as const,
      message: result.data.message,
      projectId: deletedProject.id,
    };
  } catch {
    return {
      error: true as const,
      message: "Unable to delete project. Please try again.",
    };
  }
};
