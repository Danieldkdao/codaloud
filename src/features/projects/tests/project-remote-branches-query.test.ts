// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectRemoteBranches } from "../hooks/use-project-remote-branches";

const mocks = vi.hoisted(() => ({ project: vi.fn(), branches: vi.fn() }));
vi.mock("../local/access", () => ({ requireLocalProject: mocks.project }));
vi.mock("../local/git-readers", () => ({ readLocalBranches: mocks.branches }));
const nativeRequire = createRequire(import.meta.resolve("react-native/package.json"));
const projectId = "11111111-1111-4111-8111-111111111111";
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectRemoteBranches>;
const Probe = () => {
  current = { ...useProjectRemoteBranches(projectId) };
  return null;
};
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("AbortController", nativeRequire("abort-controller").AbortController);
  mocks.project.mockReset().mockResolvedValue({ id: projectId });
  mocks.branches.mockReset().mockResolvedValue({ branches: ["main"], currentBranch: "main", nextCursor: null });
  client = new QueryClient();
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  await flush();
};

it("loads fetched remote branches with React Native cancellation signals", async () => {
  await render();
  expect(current.error).toBeNull();
  expect(current.data?.pages[0].branches).toEqual(["main"]);
  expect(mocks.branches).toHaveBeenCalledWith(projectId, expect.any(Object), "remote");
});

it("stops a cancelled query before reading branches after project lookup", async () => {
  let finish!: (project: { id: string }) => void;
  mocks.project.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => {
    await client.cancelQueries({ queryKey: ["projects", "branches"] });
    finish({ id: projectId });
  });
  await flush();
  expect(mocks.branches).not.toHaveBeenCalled();
});
