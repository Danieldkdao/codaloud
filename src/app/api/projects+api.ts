import { db } from "@/db/db";
import { createProjectSchema } from "@/features/projects/actions/schemas";
import { projectParamsSchema } from "@/features/projects/lib/project-params";
import { insertProjectOperationDB } from "@/features/projects/server/project-operations";
import {
  insertProjectDB,
  readUserProjectsDb,
} from "@/features/projects/server/projects";
import { apiResponse, getContentType } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  getGitHubCredentials,
  getGitHubErrorResponse,
} from "@/services/github/server/access";
import { verifyGitHubRepositoryAccess } from "@/services/github/server/repositories";

export const GET = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        {
          error: true,
          message: "You must be signed in to view your projects.",
        },
        401,
      );
    }

    const { searchParams } = new URL(request.url);
    const result = projectParamsSchema.safeParse(
      Object.fromEntries(searchParams),
    );

    if (!result.success) {
      return apiResponse(
        {
          error: true,
          message:
            result.error.issues[0]?.message ?? "Invalid project parameters.",
        },
        400,
      );
    }

    const userProjects = await readUserProjectsDb(userId, result.data);

    const response = apiResponse({
      error: false,
      message: "Projects loaded successfully.",
      data: userProjects,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Failed to load projects:", error);

    return apiResponse(
      { error: true, message: "Unable to load projects. Please try again." },
      500,
    );
  }
};

export const POST = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);

    if (!userId) {
      return apiResponse(
        { error: true, message: "You must be signed in to create a project." },
        401,
      );
    }

    const contentType = getContentType(request.headers);

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

    let githubAccountId: string | null = null;

    if (result.data.source === "github") {
      try {
        const { accountId, accessToken } = await getGitHubCredentials(request.headers);
        await verifyGitHubRepositoryAccess(
          accessToken,
          result.data.repositoryId,
          request.signal,
        );
        githubAccountId = accountId;
      } catch (error) {
        const { body, status } = getGitHubErrorResponse(error);
        return apiResponse(body, status);
      }
    }

    // Users may only create their own projects; ownership comes from the session.
    const insertedProject = await db.transaction(async (tx) => {
      const insertedProject = await insertProjectDB(
        {
          name: result.data.name,
          userId,
          githubRepositoryId:
            result.data.source === "github" ? result.data.repositoryId : null,
        },
        tx,
      );

      await insertProjectOperationDB(
        {
          projectId: insertedProject.id,
          userId,
          kind: "prepare",
          githubAccountId,
        },
        tx,
      );

      return insertedProject;
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
