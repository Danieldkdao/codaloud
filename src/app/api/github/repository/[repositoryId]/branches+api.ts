import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse } from "@/lib/utils";
import { gitHubRepositoryBranchesRequestSchema } from "@/services/github/schemas";
import { getGitHubAccessToken, getGitHubErrorResponse } from "@/services/github/server/access";
import { listGitHubRepositoryBranches } from "@/services/github/server/repositories";
import { GitHubRepositoryCursorError } from "@/services/github/server/repository-cursor";
import type { GitHubRepositoryBranchPage } from "@/services/github/types";

const branchesResponse = (
  body: ApiResponse<GitHubRepositoryBranchPage>,
  status = 200,
) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
};

export const GET = async (
  request: Request,
  { repositoryId }: { repositoryId: string },
) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) {
      return branchesResponse(
        { error: true, message: "Sign in to view GitHub repository branches." },
        401,
      );
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.has("page")) {
      return branchesResponse(
        { error: true, message: "Use a repository cursor instead of a page number." },
        400,
      );
    }
    const input = gitHubRepositoryBranchesRequestSchema.safeParse({
      repositoryId,
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });
    if (!input.success) {
      return branchesResponse(
        {
          error: true,
          message: input.error.issues[0]?.message ?? "Invalid branch request.",
        },
        400,
      );
    }

    const accessToken = await getGitHubAccessToken(request.headers);
    const { repositoryId: validatedRepositoryId, ...pagination } = input.data;
    // The service rechecks repository existence and read access on every page.
    const branches = await listGitHubRepositoryBranches(
      accessToken,
      validatedRepositoryId,
      request.signal,
      pagination,
    );
    return branchesResponse({
      error: false,
      message: "GitHub repository branches loaded.",
      data: branches,
    });
  } catch (error) {
    if (error instanceof GitHubRepositoryCursorError) {
      return branchesResponse(
        { error: true, message: error.message },
        error.status,
      );
    }
    const { body, status } = getGitHubErrorResponse(error);
    return branchesResponse(body, status);
  }
};
