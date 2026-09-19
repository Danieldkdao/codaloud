import { AuthRequest, ResponseType } from "expo-auth-session";
import { randomUUID } from "expo-crypto";
import { openAuthSessionAsync } from "expo-web-browser";
import { fetchBase } from "@/lib/utils";
import {
  gitHubOAuthConfigSchema,
  gitHubOAuthTokenSchema,
  gitHubProfileSchema,
  type GitHubOAuthRequestSchema,
} from "./authorization-schemas";
import {
  getGitHubConnectionRevision,
  saveGitHubConnection,
} from "./credentials";

const exchange = async (input: GitHubOAuthRequestSchema) => {
  const response = await fetchBase("/api/github/oauth", {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error("Unable to authorize GitHub. Please reconnect.");
  return gitHubOAuthTokenSchema.parse(await response.json());
};

export const refreshGitHubAuthorization = (refreshToken: string) =>
  exchange({ refreshToken });

export const connectGitHub = async () => {
  const expectedRevision = getGitHubConnectionRevision();
  const response = await fetchBase("/api/github/oauth", {
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error("GitHub connection is unavailable. Please try again.");
  const config = gitHubOAuthConfigSchema.parse(await response.json());
  const request = new AuthRequest({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    responseType: ResponseType.Code,
    usePKCE: true,
    scopes: ["repo", "read:user", "user:email"],
    state: `local-${randomUUID().replaceAll("-", "")}`,
  });
  const url = await request.makeAuthUrlAsync({
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
  });
  const result = await openAuthSessionAsync(url, "codaloud://github-connect");
  if (result.type !== "success") return false;
  const callback = new URL(result.url);
  if (
    callback.protocol !== "codaloud:" ||
    callback.hostname !== "github-connect" ||
    callback.searchParams.get("state") !== request.state ||
    callback.searchParams.has("error")
  ) {
    throw new Error(
      "GitHub authorization could not be verified. Please try again.",
    );
  }
  const code = callback.searchParams.get("code");
  if (!code || !request.codeVerifier)
    throw new Error("GitHub authorization was incomplete.");
  const token = await exchange({ code, codeVerifier: request.codeVerifier });
  if (!token.scopes.includes("repo"))
    throw new Error("Repository permission wasn’t granted. You can try again.");
  const profileResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: "application/vnd.github+json",
    },
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (!profileResponse.ok)
    throw new Error("Unable to verify the connected GitHub account.");
  const profile = gitHubProfileSchema.parse(await profileResponse.json());
  await saveGitHubConnection(token, profile, expectedRevision);
  return true;
};
