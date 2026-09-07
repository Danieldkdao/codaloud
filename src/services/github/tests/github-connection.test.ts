// @vitest-environment happy-dom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGitHubConnected } from "@/services/github/hooks/use-github-connected";

const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  listAccounts: vi.fn(),
  linkSocial: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => (() => void)) => useEffect(callback, [callback]),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { listAccounts: mocks.listAccounts, linkSocial: mocks.linkSocial },
}));

let root: Root;
let connection: ReturnType<typeof useGitHubConnected>;
let client: QueryClient;
const callbackURL = "/new-project?source=github&name=My+project";
const Probe = () => {
  connection = useGitHubConnected(callbackURL);
  return null;
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.platform.OS = "ios";
  mocks.listAccounts.mockResolvedValue({ data: [{ providerId: "github", scopes: ["repo"] }], error: null });
  mocks.linkSocial.mockResolvedValue({ error: null });
  client = new QueryClient();
  client.setQueryData(["github", "repositories", "infinite", { search: "old" }], "stale repositories");
  client.setQueryData(["projects"], "keep projects");
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

it.each(["ios", "android"])("clears cached repository data after native authorization on %s", async (platform) => {
  mocks.platform.OS = platform;
  const reset = vi.spyOn(client, "resetQueries");
  await act(async () => connection.handleConnect());
  expect(mocks.linkSocial).toHaveBeenCalledWith({ provider: "github", scopes: ["repo"], callbackURL, errorCallbackURL: callbackURL });
  expect(mocks.listAccounts).toHaveBeenCalledTimes(2);
  expect(connection.isConnected).toBe(true);
  expect(connection.isPending).toBe(false);
  expect(reset).toHaveBeenCalledWith({ queryKey: ["github", "repositories"] });
  expect(client.getQueryData(["github", "repositories", "infinite", { search: "old" }])).toBeUndefined();
  expect(client.getQueryData(["projects"])).toBe("keep projects");
});

it("waits for native authorization before resetting repositories", async () => {
  let complete!: (value: { error: null }) => void;
  mocks.linkSocial.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const reset = vi.spyOn(client, "resetQueries");
  await act(async () => connection.handleConnect());
  expect(connection.isPending).toBe(true);
  expect(reset).not.toHaveBeenCalled();
  await act(async () => complete({ error: null }));
  expect(reset).toHaveBeenCalledOnce();
  expect(connection.isPending).toBe(false);
});

it("leaves web recovery to the OAuth callback reload", async () => {
  mocks.platform.OS = "web";
  const reset = vi.spyOn(client, "resetQueries");
  await act(async () => connection.handleConnect());
  expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});

it("keeps failed authorization recoverable", async () => {
  mocks.linkSocial.mockResolvedValue({ error: { message: "Authorization failed" } });
  const reset = vi.spyOn(client, "resetQueries");
  await act(async () => connection.handleConnect());
  expect(connection.status).toContain("Unable to connect GitHub");
  expect(connection.isPending).toBe(false);
  expect(reset).not.toHaveBeenCalled();
});

it("does not reset repositories if the repo grant is still missing", async () => {
  mocks.listAccounts.mockResolvedValue({ data: [{ providerId: "github", scopes: ["read:user"] }], error: null });
  const reset = vi.spyOn(client, "resetQueries");
  await act(async () => connection.handleConnect());
  expect(connection.isConnected).toBe(false);
  expect(connection.status).toContain("wasn’t granted");
  expect(reset).not.toHaveBeenCalled();
});
