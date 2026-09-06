import { createProjectSchema } from "@/features/projects/actions/schemas";
import { insertProjectDB } from "@/features/projects/server/projects";
import { apiResponse } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getGitHubAccessToken, getGitHubErrorResponse } from "@/services/github/server/access";
import { verifyGitHubRepositoryAccess } from "@/services/github/server/repositories";

export const POST = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        { error: true, message: "You must be signed in to create a project." },
        401,
      );
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();

    // Requiring JSON also prevents cross-site form posts using session cookies.
    if (contentType !== "application/json") {
      return apiResponse(
        { error: true, message: "Content-Type must be application/json." },
        415,
      );
    }

    const payload: unknown = await request.json();

    const result = createProjectSchema.safeParse(payload);

    if (!result.success) {
      return apiResponse(
        {
          error: true,
          message: result.error.issues[0]?.message ?? "Invalid project data.",
        },
        400,
      );
    }

    if (result.data.source === "github") {
      try {
        const accessToken = await getGitHubAccessToken(request.headers);
        await verifyGitHubRepositoryAccess(accessToken, result.data.repositoryId, request.signal);
      } catch (error) {
        const { body, status } = getGitHubErrorResponse(error);
        return apiResponse(body, status);
      }
    }

    // Users may only create their own projects; ownership comes from the session.
    const insertedProject = await insertProjectDB({
      name: result.data.name,
      userId,
      githubRepositoryId:
        result.data.source === "github" ? result.data.repositoryId : null,
    });

    return apiResponse(
      {
        error: false,
        message: "Project created successfully.",
        data: insertedProject,
      },
      201,
    );
  } catch (error) {
    console.error("Failed to create project:", error);

    return apiResponse(
      { error: true, message: "Unable to create project. Please try again." },
      500,
    );
  }
};
