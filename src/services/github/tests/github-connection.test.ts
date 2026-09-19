// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGitHubConnected } from "../hooks/use-github-connected";
import { useGitHubRepositories } from "../hooks/use-github-repositories";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), read: vi.fn() }));
vi.mock("../actions/actions", () => ({ readGitHubRepositories: mocks.read }));
vi.mock("../authorization", () => ({ connectGitHub: mocks.connect }));
vi.mock("../credentials", () => ({ disconnectGitHub: mocks.disconnect, loadGitHubConnection: vi.fn() }));
vi.mock("../hooks/use-github-profile", () => ({ useGitHubProfile: () => ({ ready: true, profile: { id: 1 }, scopes: ["repo"], error: null }) }));
let root: Root;
let client: QueryClient;
let connection: ReturnType<typeof useGitHubConnected>;
const Probe = () => { connection = useGitHubConnected(); return null; };
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.connect.mockReset().mockResolvedValue(true);
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  client = new QueryClient();
  client.setQueryData(["github", "repositories"], "old account repositories");
  client.setQueryData(["projects"], "local projects");
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
});
afterEach(() => { act(() => root.unmount()); client.clear(); });

it("clears GitHub data after authorization without clearing local projects", async () => {
  await act(async () => connection.handleConnect());
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(client.getQueryData(["github", "repositories"])).toBeUndefined();
  expect(client.getQueryData(["projects"])).toBe("local projects");
});

it("keeps existing connection data when authorization is cancelled", async () => {
  mocks.connect.mockResolvedValue(false);
  await act(async () => connection.handleConnect());
  expect(client.getQueryData(["github", "repositories"])).toBe("old account repositories");
});

it("keeps failed authorization recoverable", async () => {
  mocks.connect.mockRejectedValue(new Error("Authorization failed"));
  await act(async () => connection.handleConnect());
  expect(connection.connectionError).toBeTruthy();
  expect(connection.isPending).toBe(false);
});

it("disconnects GitHub without deleting local projects", async () => {
  await act(async () => connection.handleDisconnect());
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(client.getQueryData(["github", "repositories"])).toBeUndefined();
  expect(client.getQueryData(["projects"])).toBe("local projects");
});

it("automatically reloads an already mounted repository picker after connecting", async () => {
  let repositories!: ReturnType<typeof useGitHubRepositories>;
  const RepositoryPicker = () => {
    repositories = { ...useGitHubRepositories() };
    return null;
  };
  client.setDefaultOptions({ queries: { retry: false } });
  mocks.read.mockResolvedValueOnce(null).mockResolvedValue({ repositories: [], nextCursor: null });
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client },
      createElement("div", null, createElement(Probe), createElement(RepositoryPicker))));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(repositories.isError).toBe(true);
  await act(async () => connection.handleConnect());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(repositories.isSuccess).toBe(true);
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
