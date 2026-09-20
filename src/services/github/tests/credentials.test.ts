import { beforeEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: storage.get, setItemAsync: storage.set, deleteItemAsync: storage.remove, WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device" }));
vi.mock("../authorization", () => ({ refreshGitHubAuthorization: vi.fn() }));

const token = { accessToken: "secret", scopes: ["repo"], expiresIn: null, refreshToken: null, refreshTokenExpiresIn: null };
const profile = { id: 1, login: "octocat", name: "Octocat", email: null, avatar_url: "https://github.com/avatar.png" };

beforeEach(() => {
  vi.resetModules(); storage.get.mockReset().mockResolvedValue(null);
  storage.set.mockReset().mockResolvedValue(undefined); storage.remove.mockReset().mockResolvedValue(undefined);
});

it("opens disconnected without making network requests", async () => {
  const credentials = await import("../credentials");
  await credentials.loadGitHubConnection();
  expect(credentials.getGitHubConnectionSnapshot()).toMatchObject({ ready: true, profile: null });
  await expect(credentials.getGitHubAccessToken()).rejects.toThrow("Connect GitHub");
});

it("persists secrets in SecureStore and exposes only profile information to hooks", async () => {
  const credentials = await import("../credentials");
  await credentials.saveGitHubConnection(token, profile);
  expect(storage.set).toHaveBeenCalledWith("codaloud.github.connection", expect.stringContaining("secret"), expect.objectContaining({ keychainAccessible: "device" }));
  expect(JSON.stringify(credentials.getGitHubConnectionSnapshot())).not.toContain("secret");
  expect(await credentials.getGitHubAccessToken()).toBe("secret");
});

it("disconnects without deleting projects or accepting a delayed connection result", async () => {
  const credentials = await import("../credentials");
  const revision = credentials.getGitHubConnectionRevision();
  await credentials.disconnectGitHub();
  await expect(credentials.saveGitHubConnection(token, profile, revision)).rejects.toThrow();
  expect(storage.set).not.toHaveBeenCalled();
  expect(credentials.getGitHubConnectionSnapshot().profile).toBeNull();
});

it("does not publish a connection when the credential write fails", async () => {
  storage.set.mockRejectedValue(new Error("Keychain unavailable"));
  const credentials = await import("../credentials");
  await expect(credentials.saveGitHubConnection(token, profile)).rejects.toThrow();
  expect(credentials.getGitHubConnectionSnapshot().profile).toBeNull();
});

it("does not resurrect saved credentials when a startup read resolves after disconnect", async () => {
  let complete!: (value: string) => void;
  storage.get.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const credentials = await import("../credentials");
  const loading = credentials.loadGitHubConnection();
  await credentials.disconnectGitHub();
  complete(JSON.stringify({ ...token, profile, expiresAt: null, refreshTokenExpiresAt: null }));
  await loading;
  expect(credentials.getGitHubConnectionSnapshot().profile).toBeNull();
});
