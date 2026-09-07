import { APIError } from "better-auth/api";
import { RequestError } from "octokit";

import { auth } from "@/lib/auth/auth";
import type { ApiResponse } from "@/lib/types";

export class GitHubAccessError extends Error {
  constructor(message: string, readonly code?: "GITHUB_RECONNECT_REQUIRED") {
    super(message);
    this.name = "GitHubAccessError";
  }
}

export const getGitHubAccessToken = async (headers: Headers) => {
  // Select the linked account from the session, never from client input.
  const accounts = await auth.api.listUserAccounts({ headers });
  const githubAccount = accounts.find(
    (account) => account.providerId === "github" && account.scopes.includes("repo"),
  );
  if (!githubAccount) {
    throw new GitHubAccessError(
      "Connect GitHub and grant repository access first.",
      "GITHUB_RECONNECT_REQUIRED",
    );
  }

  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: githubAccount.id },
    headers,
  });
  if (!accessToken) {
    throw new GitHubAccessError(
      "Reconnect GitHub to access your repositories.",
      "GITHUB_RECONNECT_REQUIRED",
    );
  }
  return accessToken;
};

export const getGitHubErrorResponse = (
  error: unknown,
): { status: number; body: ApiResponse } => {
  if (error instanceof GitHubAccessError) {
    return { status: 403, body: { error: true, message: error.message, code: error.code } };
  }
  if (error instanceof APIError && error.statusCode === 401) {
    return { status: 401, body: { error: true, message: "Sign in to access your GitHub repositories." } };
  }
  if (
    (error instanceof APIError && error.body?.code === "FAILED_TO_GET_ACCESS_TOKEN") ||
    (error instanceof RequestError && error.status === 401)
  ) {
    return {
      status: 403,
      body: {
        error: true,
        message: "Reconnect GitHub to access your repositories.",
        code: "GITHUB_RECONNECT_REQUIRED",
      },
    };
  }
  if (error instanceof RequestError) {
    const headers = error.response?.headers;
    if (
      error.status === 429 ||
      (error.status === 403 &&
        (headers?.["x-ratelimit-remaining"] === "0" || headers?.["retry-after"] !== undefined))
    ) {
      return { status: 429, body: { error: true, message: "GitHub is limiting requests. Please try again later." } };
    }
    if (error.status === 403 || error.status === 404) {
      return {
        status: 403,
        body: { error: true, message: "GitHub denied access. Check your repository permissions and organization access." },
      };
    }
  }
  // Upstream errors can include tokens and private request details.
  return { status: 502, body: { error: true, message: "Unable to access GitHub repositories. Please try again." } };
};
