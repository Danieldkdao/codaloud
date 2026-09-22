import { beforeEach, expect, it, vi } from "vitest";
let handleGitHubOAuthRequest: typeof import("../server/oauth").handleGitHubOAuthRequest;
let redirectGitHubOAuthCallback: typeof import("../server/oauth").redirectGitHubOAuthCallback;

const request = (body: unknown) => new Request("https://codaloud.test/api/github/oauth", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const verifier = "v".repeat(64);

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://example.test/codaloud");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
  vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "server-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
  vi.stubEnv("BETTER_AUTH_URL", "https://codaloud.test");
  vi.stubEnv("TRIGGER_SECRET_KEY", "trigger-secret");
  vi.stubEnv("DAYTONA_API_KEY", "daytona-key");
  vi.stubEnv("DEEPGRAM_API_KEY", "test");
  vi.stubEnv("OPENROUTER_API_KEY", "test");
  vi.stubEnv("LIVEKIT_URL", "wss://livekit.test");
  vi.stubEnv("LIVEKIT_API_KEY", "test");
  vi.stubEnv("LIVEKIT_API_SECRET", "test");
  vi.stubEnv("FIRECRAWL_API_KEY", "test");
  vi.stubEnv("ELEVENLABS_API_KEY", "test");
  vi.stubEnv("DAYTONA_TARGET", "us");
  ({ handleGitHubOAuthRequest, redirectGitHubOAuthCallback } = await import("../server/oauth"));
});

it("provides only public OAuth configuration without a Codaloud session", async () => {
  const response = await handleGitHubOAuthRequest(new Request("https://codaloud.test/api/github/oauth"));
  expect(await response.json()).toEqual({ clientId: "client-id", redirectUri: "https://codaloud.test/api/auth/callback/github" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("requires PKCE and never exchanges an invalid request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await handleGitHubOAuthRequest(request({ code: "code" }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects malformed JSON before contacting GitHub", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await handleGitHubOAuthRequest(new Request("https://codaloud.test/api/github/oauth", { method: "POST", body: "{" }));
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("exchanges the code with the server secret and supplied verifier", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ access_token: "token", token_type: "bearer", scope: "repo" }));
  vi.stubGlobal("fetch", fetch);
  const response = await handleGitHubOAuthRequest(request({ code: "code", codeVerifier: verifier }));
  expect(response.status).toBe(200);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({ client_secret: "server-secret", code_verifier: verifier, redirect_uri: "https://codaloud.test/api/auth/callback/github" });
  expect(await response.json()).toEqual({ accessToken: "token", scopes: ["repo"], expiresIn: null, refreshToken: null, refreshTokenExpiresIn: null });
});

it("does not expose upstream error details or tokens on failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "bad_verification_code", error_description: "server-secret private-details" })));
  const response = await handleGitHubOAuthRequest(request({ code: "code", codeVerifier: verifier }));
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain("private-details");
});

it("redirects only local OAuth callbacks to the fixed native return address", () => {
  const state = `local-${"s".repeat(48)}`;
  const response = redirectGitHubOAuthCallback(new Request(`https://codaloud.test/api/auth/callback/github?state=${state}&code=code&redirect_uri=https://evil.test`));
  expect(response?.headers.get("Location")).toBe(`codaloud://github-connect?state=${state}&code=code`);
  expect(redirectGitHubOAuthCallback(new Request("https://codaloud.test/api/auth/callback/github?state=legacy"))).toBeNull();
});

it("rejects incomplete server configuration before handling OAuth requests", async () => {
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  vi.resetModules();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(import("../server/oauth")).rejects.toThrow();
  log.mockRestore();
});
