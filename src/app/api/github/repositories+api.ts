import type { GitHubRepository } from "@/features/projects/types";
import { auth } from "@/lib/auth/auth";
import { getCurrentUser } from "@/lib/auth/helpers";
import { paginationSchema } from "@/lib/schemas";
import type { ApiResponse } from "@/lib/types";
import { apiResponse } from "@/lib/utils";
import { listGitHubRepositories } from "@/services/github/repositories";
import { APIError } from "better-auth/api";
import { RequestError } from "octokit";

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

    // Account selection comes from the session, never a client-supplied ID.
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    const githubAccount = accounts.find(
      (account) => account.providerId === "github" && account.scopes.includes("repo"),
    );
    if (!githubAccount) {
      return repositoryResponse(
        { error: true, message: "Connect GitHub and grant repository access first." },
        403,
      );
    }

    const { accessToken } = await auth.api.getAccessToken({
      body: { accountId: githubAccount.id },
      headers: request.headers,
    });
    if (!accessToken) {
      return repositoryResponse(
        { error: true, message: "Reconnect GitHub to view your repositories." },
        403,
      );
    }

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
    if (error instanceof APIError) {
      if (error.statusCode === 401) {
        return repositoryResponse(
          { error: true, message: "Sign in to view your GitHub repositories." },
          401,
        );
      }
      if (error.body?.code === "FAILED_TO_GET_ACCESS_TOKEN") {
        return repositoryResponse(
          { error: true, message: "Reconnect GitHub to view your repositories." },
          403,
        );
      }
    }

    if (error instanceof RequestError) {
      const headers = error.response?.headers;
      const isRateLimited =
        error.status === 429 ||
        (error.status === 403 &&
          (headers?.["x-ratelimit-remaining"] === "0" ||
            headers?.["retry-after"] !== undefined));
      if (isRateLimited) {
        return repositoryResponse(
          { error: true, message: "GitHub is limiting requests. Please try again later." },
          429,
        );
      }
      if (error.status === 401) {
        return repositoryResponse(
          { error: true, message: "Reconnect GitHub to view your repositories." },
          403,
        );
      }
      if (error.status === 403) {
        return repositoryResponse(
          {
            error: true,
            message: "GitHub denied access. Check your repository permissions and organization access.",
          },
          403,
        );
      }
    }

    // GitHub errors can contain authenticated request details; don't expose them.
    return repositoryResponse(
      { error: true, message: "Unable to load GitHub repositories. Please try again." },
      502,
    );
  }
};
