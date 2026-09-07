import type { GitHubRepositoryPage } from "@/services/github/types";
import { getCurrentUser } from "@/lib/auth/helpers";
import { gitHubRepositoryRequestSchema } from "@/services/github/schemas";
import { GitHubRepositoryCursorError } from "@/services/github/server/repository-cursor";
import type { ApiResponse } from "@/lib/types";
import { apiResponse } from "@/lib/utils";
import { listGitHubRepositoryPage } from "@/services/github/server/repositories";
import { getGitHubAccessToken, getGitHubErrorResponse } from "@/services/github/server/access";

const repositoryResponse = (
  body: ApiResponse<GitHubRepositoryPage>,
  status = 200,
) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
};

export const GET = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) {
      return repositoryResponse(
        { error: true, message: "Sign in to view your GitHub repositories." },
        401,
      );
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.has("page")) {
      return repositoryResponse(
        { error: true, message: "Use a repository cursor instead of a page number." },
        400,
      );
    }
    const pagination = gitHubRepositoryRequestSchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });
    if (!pagination.success) {
      return repositoryResponse(
        {
          error: true,
          message: pagination.error.issues[0]?.message ?? "Invalid pagination.",
        },
        400,
      );
    }

    const accessToken = await getGitHubAccessToken(request.headers);

    const repositories = await listGitHubRepositoryPage(
      accessToken,
      request.signal,
      pagination.data,
    );
    return repositoryResponse({
      error: false,
      message: "GitHub repositories loaded.",
      data: repositories,
    });
  } catch (error) {
    if (error instanceof GitHubRepositoryCursorError) {
      return repositoryResponse(
        { error: true, message: error.message },
        error.status,
      );
    }
    const { body, status } = getGitHubErrorResponse(error);
    return repositoryResponse(body, status);
  }
};
