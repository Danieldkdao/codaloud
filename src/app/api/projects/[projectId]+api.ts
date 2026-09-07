import { updateProjectSchema } from "@/features/projects/actions/schemas";
import {
  confirmUserProjectOwnership,
  deleteUserProjectDb,
  updateUserProjectDb,
} from "@/features/projects/server/projects";
import { getCurrentUser } from "@/lib/auth/helpers";
import { apiResponse, getContentType, isValidIds } from "@/lib/utils";

export const GET = async (
  request: Request,
  { projectId }: { projectId: string },
) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        { error: true, message: "You must be signed in to view a project." },
        401,
      );
    }

    if (!isValidIds(projectId)) {
      return apiResponse({ error: true, message: "Invalid project ID." }, 400);
    }

    const existingProject = await confirmUserProjectOwnership(
      userId,
      projectId,
    );

    if (!existingProject) {
      return apiResponse({ error: true, message: "Project not found." }, 404);
    }

    const response = apiResponse({
      error: false,
      message: "Project loaded successfully.",
      data: existingProject,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Failed to load project:", error);

    return apiResponse(
      { error: true, message: "Unable to load project. Please try again." },
      500,
    );
  }
};

export const PATCH = async (
  request: Request,
  { projectId }: { projectId: string },
) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        { error: true, message: "You must be signed in to update a project." },
        401,
      );
    }

    if (!isValidIds(projectId)) {
      return apiResponse({ error: true, message: "Invalid project ID." }, 400);
    }

    const contentType = getContentType(request.headers);

    if (contentType !== "application/json") {
      return apiResponse(
        { error: true, message: "Content-Type must be application/json." },
        415,
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiResponse(
        { error: true, message: "Request body must be valid JSON." },
        400,
      );
    }

    const result = updateProjectSchema.safeParse(payload);

    if (!result.success) {
      return apiResponse(
        {
          error: true,
          message: result.error.issues[0]?.message ?? "Invalid project data.",
        },
        400,
      );
    }

    const updatedProject = await updateUserProjectDb(
      userId,
      projectId,
      result.data,
    );

    if (!updatedProject) {
      return apiResponse({ error: true, message: "Project not found." }, 404);
    }

    return apiResponse({
      error: false,
      message: "Project updated successfully.",
      data: updatedProject,
    });
  } catch (error) {
    console.error("Failed to update project:", error);

    return apiResponse(
      { error: true, message: "Unable to update project. Please try again." },
      500,
    );
  }
};

export const DELETE = async (
  request: Request,
  { projectId }: { projectId: string },
) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        { error: true, message: "You must be signed in to delete a project." },
        401,
      );
    }

    if (!isValidIds(userId)) {
      return apiResponse({ error: true, message: "Invalid user ID." }, 401);
    }

    if (!isValidIds(projectId)) {
      return apiResponse({ error: true, message: "Invalid project ID." }, 400);
    }

    const deletedProject = await deleteUserProjectDb(userId, projectId);

    if (!deletedProject) {
      return apiResponse({ error: true, message: "Project not found." }, 404);
    }

    return apiResponse({
      error: false,
      message: "Project deleted successfully.",
      data: deletedProject,
    });
  } catch (error) {
    console.error("Failed to delete project:", error);

    return apiResponse(
      { error: true, message: "Unable to delete project. Please try again." },
      500,
    );
  }
};
