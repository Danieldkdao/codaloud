import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { RequestError } from "octokit";

import { auth } from "@/lib/auth/auth";
import type { ApiResponse } from "@/lib/types";

import { GitHubAccessError } from "../access-error";
export { GitHubAccessError } from "../access-error";

const resolveGitHubCredentials = async (
  body: { accountId: string; userId?: string },
  headers?: Headers,
) => {
  const { accessToken } = await auth.api.getAccessToken({
    body,
    ...(headers ? { headers } : {}),
  });
  if (!accessToken) {
    throw new GitHubAccessError(
      "Reconnect GitHub to access your repositories.",
      "GITHUB_RECONNECT_REQUIRED",
    );
  }
  return { accountId: body.accountId, accessToken };
};

export const getGitHubCredentials = async (headers: Headers) => {
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

  return resolveGitHubCredentials({ accountId: githubAccount.id }, headers);
};

// Worker callers must use the owner and linked account from their saved operation.
export const getGitHubCredentialsForUser = async (
  userId: string,
  accountId: string | null,
) => {
  if (!accountId) {
    throw new GitHubAccessError(
      "Reconnect GitHub to access your repositories.",
      "GITHUB_RECONNECT_REQUIRED",
    );
  }

  const [{ db }, { account }] = await Promise.all([
    import("@/db/db"),
    import("@/db/schemas/user"),
  ]);
  const [existingGitHubAccount] = await db
    .select({ id: account.id, scope: account.scope })
    .from(account)
    .where(and(eq(account.id, accountId), eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  // Better Auth stores provider scopes as a comma-separated string.
  if (!existingGitHubAccount?.scope?.split(",").some((scope) => scope.trim() === "repo")) {
    throw new GitHubAccessError(
      "Connect GitHub and grant repository access first.",
      "GITHUB_RECONNECT_REQUIRED",
    );
  }

  // Let Better Auth decrypt and refresh tokens; never read token columns ourselves.
  return resolveGitHubCredentials({ accountId: existingGitHubAccount.id, userId });
};

export const getGitHubAccessToken = async (headers: Headers) => {
  const { accessToken } = await getGitHubCredentials(headers);
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
