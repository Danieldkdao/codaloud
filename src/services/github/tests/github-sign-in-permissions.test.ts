import { expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { auth } from "@/lib/auth/auth";

vi.mock("@/data/env/server", () => ({ serverEnv: {
  BETTER_AUTH_URL: "https://codaloud.test",
  BETTER_AUTH_SECRET: "test-secret-for-github-permission-regression",
  GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-secret",
} }));
vi.mock("@/db/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({}));
vi.mock("@better-auth/drizzle-adapter", () => ({ drizzleAdapter: () => undefined }));
vi.mock("@/lib/auth/utils", () => ({ generateAppleClientSecret: vi.fn() }));

it("preserves a repository grant through sign-in and still replaces it on explicit reconnection", async () => {
  const testAuth = betterAuth({
    ...auth.options,
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    plugins: [],
    trustedOrigins: ["https://codaloud.test"],
  });
  const context = await testAuth.$context;
  const provider = context.socialProviders.find((value) => value.id === "github");
  if (!provider) throw new Error("GitHub provider is missing");
  let token = "repository-token";
  let scopes = ["read:user", "user:email", "repo"];
  vi.spyOn(provider, "validateAuthorizationCode").mockImplementation(async () => ({ accessToken: token, scopes }));
  vi.spyOn(provider, "getUserInfo").mockResolvedValue({ user: {
    name: "Test User", email: "test@example.com", emailVerified: true,
  }, data: { id: 12345 } });

  const completeAuthorization = async (response: Response) => {
    expect(response.status).toBe(200);
    const { url } = await response.json();
    const state = new URL(url).searchParams.get("state")!;
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const callback = await testAuth.handler(new Request(
      `https://codaloud.test/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    ));
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).not.toContain("error=");
    return callback.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  };
  const signIn = () => testAuth.api.signInSocial({ body: {
    provider: "github", callbackURL: "https://codaloud.test/account",
  }, asResponse: true });

  await completeAuthorization(await signIn());
  const existingAccount = await context.internalAdapter.findAccountByKey({ accountId: "12345", providerId: "github" });
  if (!existingAccount) throw new Error("GitHub account was not created");
  const readToken = async () => (await testAuth.api.getAccessToken({ body: {
    accountId: existingAccount.id, userId: existingAccount.userId,
  } })).accessToken;
  expect(await readToken()).toBe("repository-token");

  token = "sign-in-only-token";
  scopes = ["read:user", "user:email"];
  const cookie = await completeAuthorization(await signIn());
  expect(await readToken()).toBe("repository-token");

  token = "reconnected-repository-token";
  scopes = ["read:user", "user:email", "repo"];
  await completeAuthorization(await testAuth.api.linkSocialAccount({
    body: { provider: "github", scopes: ["repo"], callbackURL: "https://codaloud.test/account" },
    headers: new Headers({ cookie, origin: "https://codaloud.test" }),
    asResponse: true,
  }));
  expect(await readToken()).toBe("reconnected-repository-token");
});
