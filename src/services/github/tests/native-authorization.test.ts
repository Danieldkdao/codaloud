import { afterEach, expect, it, vi } from "vitest";
import { connectGitHub } from "../authorization";

const mocks = vi.hoisted(() => ({ fetchBase: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/utils", () => ({ fetchBase: mocks.fetchBase }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "device-request" }));
vi.mock("expo-auth-session", () => ({
  ResponseType: { Code: "code" },
  AuthRequest: class {
    state = "verified-state";
    codeVerifier = "v".repeat(64);
    makeAuthUrlAsync = async () => "https://github.com/login/oauth/authorize";
  },
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: async () => ({
    type: "success",
    url: "codaloud://github-connect?state=verified-state&code=code",
  }),
}));
vi.mock("../credentials", () => ({
  getGitHubConnectionRevision: () => 1,
  saveGitHubConnection: mocks.save,
}));
afterEach(() => vi.unstubAllGlobals());

it("requests the connected profile with the supported REST API version", async () => {
  mocks.fetchBase
    .mockResolvedValueOnce(Response.json({ clientId: "client", redirectUri: "https://codaloud.test/api/auth/callback/github" }))
    .mockResolvedValueOnce(Response.json({ accessToken: "device-token", scopes: ["repo", "read:user"], expiresIn: null, refreshToken: null, refreshTokenExpiresIn: null }));
  const profile = { id: 42, login: "developer", name: null, email: null, avatar_url: "https://avatars.githubusercontent.com/u/42" };
  const fetchGitHub = vi.fn<typeof fetch>().mockResolvedValue(Response.json(profile));
  vi.stubGlobal("fetch", fetchGitHub);

  expect(await connectGitHub()).toBe(true);
  expect(fetchGitHub).toHaveBeenCalledOnce();
  const [url, request] = fetchGitHub.mock.calls[0];
  expect(url).toBe("https://api.github.com/user");
  const headers = new Headers(request?.headers);
  expect(headers.get("x-github-api-version")).toBe("2026-03-10");
  expect(headers.get("authorization")).toBe("Bearer device-token");
  expect(mocks.save).toHaveBeenCalledOnce();
});
