import { z } from "zod";
import {
  gitHubOAuthRequestSchema,
  gitHubOAuthTokenSchema,
} from "../authorization-schemas";

const configurationSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  baseUrl: z.url(),
});
type ConfigurationSchema = z.infer<typeof configurationSchema>;

const readConfiguration = (): ConfigurationSchema =>
  configurationSchema.parse({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    baseUrl: process.env.BETTER_AUTH_URL,
  });

const respond = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const handleGitHubOAuthRequest = async (request: Request) => {
  try {
    const { clientId, clientSecret, baseUrl } = readConfiguration();
    const redirectUri = new URL(
      "/api/auth/callback/github",
      baseUrl,
    ).toString();
    if (request.method === "GET") return respond({ clientId, redirectUri });
    if (request.method !== "POST")
      return respond({ message: "Method not allowed." }, 405);
    const text = await request.text();
    if (text.length > 4096)
      return respond({ message: "Invalid authorization request." }, 400);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return respond({ message: "Invalid authorization request." }, 400);
    }
    const parsed = gitHubOAuthRequestSchema.safeParse(body);
    if (!parsed.success)
      return respond({ message: "Invalid authorization request." }, 400);
    const input = parsed.data;
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          ...("code" in input
            ? {
                code: input.code,
                code_verifier: input.codeVerifier,
                redirect_uri: redirectUri,
              }
            : {
                grant_type: "refresh_token",
                refresh_token: input.refreshToken,
              }),
        }),
      },
    );
    const token = await response.json();
    if (!response.ok || token.error || token.token_type !== "bearer") {
      return respond(
        { message: "GitHub authorization failed. Please reconnect." },
        401,
      );
    }
    const output = gitHubOAuthTokenSchema.safeParse({
      accessToken: token.access_token,
      scopes:
        typeof token.scope === "string"
          ? token.scope.split(/[ ,]+/).filter(Boolean)
          : [],
      expiresIn: token.expires_in ?? null,
      refreshToken: token.refresh_token ?? null,
      refreshTokenExpiresIn: token.refresh_token_expires_in ?? null,
    });
    if (!output.success)
      return respond(
        { message: "Invalid GitHub authorization response." },
        502,
      );
    return respond(output.data);
  } catch {
    // Provider failures can contain credentials. Do not log or forward them.
    return respond(
      { message: "Unable to connect to GitHub. Please try again." },
      502,
    );
  }
};

export const redirectGitHubOAuthCallback = (request: Request) => {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/callback/github") return null;
  const state = url.searchParams.get("state");
  if (!state || !/^local-[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  const callback = new URL("codaloud://github-connect");
  callback.searchParams.set("state", state);
  const code = url.searchParams.get("code");
  if (code && code.length <= 1024) callback.searchParams.set("code", code);
  else callback.searchParams.set("error", "authorization_failed");
  return new Response(null, {
    status: 302,
    headers: { Location: callback.toString(), "Cache-Control": "no-store" },
  });
};
