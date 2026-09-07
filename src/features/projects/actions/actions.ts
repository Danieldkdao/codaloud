import { Platform } from "react-native";

import {
  createProjectFormSchema,
  createProjectResponseSchema,
  readProjectResponseSchema,
  readProjectsResponseSchema,
  type CreateProjectFormSchema,
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
      credentials: Platform.OS === "web" ? "same-origin" : "omit",
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
      credentials: Platform.OS === "web" ? "same-origin" : "omit",
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
      credentials: Platform.OS === "web" ? "same-origin" : "omit",
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
