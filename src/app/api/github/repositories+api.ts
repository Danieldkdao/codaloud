import type { GitHubRepository } from "@/features/projects/types";
import { getCurrentUser } from "@/lib/auth/helpers";
import { paginationSchema } from "@/lib/schemas";
import type { ApiResponse } from "@/lib/types";
import { apiResponse } from "@/lib/utils";
import { listGitHubRepositories } from "@/services/github/server/repositories";
import { getGitHubAccessToken, getGitHubErrorResponse } from "@/services/github/server/access";

const repositoryResponse = (
  body: ApiResponse<GitHubRepository[]>,
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
    const pagination = paginationSchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
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

    const repositories = await listGitHubRepositories(
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
    const { body, status } = getGitHubErrorResponse(error);
    return repositoryResponse(body, status);
  }
};
