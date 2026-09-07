import { Platform } from "react-native";

import {
  createProjectFormSchema,
  createProjectResponseSchema,
  type CreateProjectFormSchema,
} from "@/features/projects/actions/schemas";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";
import type { ProjectResponseData } from "@/features/projects/lib/types";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import type { ApiResponse } from "@/lib/types";
import { createRequestHeaders, createSearchParams, fetchBase } from "@/lib/utils";

export const readUserProjectsAction = async (
  params: Partial<ProjectParamsSchema> = {},
  signal?: AbortSignal,
): Promise<ProjectResponseData[] | null> => {
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

    const result: ApiResponse<ProjectResponseData[]> = await response.json();
    if (result?.error !== false || !Array.isArray(result.data)) return null;

    return result.data;
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
