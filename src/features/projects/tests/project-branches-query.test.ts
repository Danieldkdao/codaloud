// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readProjectBranchesAction } from "../actions/git-actions";
import { useProjectBranches } from "../hooks/use-project-branches";
import type { ProjectBranchPageSchema } from "../actions/branch-schemas";

const session = vi.hoisted(() => ({
  data: { user: { id: "user-one" } } as { user: { id: string } } | null,
  isPending: false,
  error: null as Error | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("../actions/git-actions", () => ({ readProjectBranchesAction: vi.fn() }));

const read = vi.mocked(readProjectBranchesAction);
const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const cursor = JSON.stringify({ version: 1, projectId, search: "", after: "a" });
const page = (branches: string[], nextCursor: string | null = null): ProjectBranchPageSchema => ({
  branches, currentBranch: "main", nextCursor,
});
type Options = NonNullable<Parameters<typeof useProjectBranches>[1]>;
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectBranches>;

const Probe = ({ id, options }: { id: string | null; options: Options }) => {
  current = { ...useProjectBranches(id, options) };
  return null;
};
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
const render = async (options: Options = {}, id: string | null = projectId) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { id, options })));
  });
  await flush();
};
const run = async (operation: () => Promise<unknown>) => {
  await act(async () => { await operation(); });
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
  session.data = { user: { id: "user-one" } };
  session.isPending = false;
  session.error = null;
  read.mockReset().mockResolvedValue(page([]));
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

it("passes default parameters and follows cursors until exhausted", async () => {
  read.mockResolvedValueOnce(page(["a"], cursor)).mockResolvedValueOnce(page(["b"]));
  await render();
  expect(read).toHaveBeenCalledWith(projectId, { search: "", pageSize: 20, cursor: null }, expect.any(AbortSignal), expect.any(Function));
  expect(current.hasNextPage).toBe(true);
  await run(() => current.fetchNextPage());
  expect(current.data?.pages.flatMap((result) => result.branches)).toEqual(["a", "b"]);
  expect(current.data?.pageParams).toEqual([null, cursor]);
  expect(current.hasNextPage).toBe(false);
  await run(() => current.fetchNextPage());
  expect(read).toHaveBeenCalledTimes(2);
});

it("shares normalized searches and starts new searches and page sizes from page one", async () => {
  await render({ search: " FEATURE " });
  await render({ search: "feature" });
  expect(read).toHaveBeenCalledOnce();
  await render({ search: "fix" });
  await render({ search: "fix", pageSize: 5 });
  expect(read.mock.calls.map(([, params]) => [params?.search, params?.pageSize, params?.cursor]))
    .toEqual([["feature", 20, null], ["fix", 20, null], ["fix", 5, null]]);
});

it.each(["pending", "signed-out", "error"])("blocks requests and manual refetch while authentication is %s", async (state) => {
  if (state === "pending") session.isPending = true;
  if (state === "signed-out") session.data = null;
  if (state === "error") session.error = new Error("Session unavailable");
  await render();
  await run(() => current.refetch());
  expect(read).not.toHaveBeenCalled();
});

it("isolates projects and accounts in the cache", async () => {
  read.mockResolvedValueOnce(page(["a"])).mockResolvedValueOnce(page(["b"])).mockResolvedValueOnce(page(["c"]));
  await render();
  await render({}, otherProjectId);
  expect(current.data?.pages).toEqual([page(["b"])]);
  session.data = { user: { id: "user-two" } };
  await render();
  expect(current.data?.pages).toEqual([page(["c"])]);
  expect(client.getQueryCache().getAll()).toHaveLength(3);
});

it.each<Options>([{ pageSize: 0 }, { search: "x".repeat(201) }, { cursor: "invalid" }, { maxPages: -1 }, { maxPages: 1.5 }])(
  "rejects invalid options even on manual refetch: %j", async (options) => {
    await render(options);
    await run(() => current.refetch());
    expect(read).not.toHaveBeenCalled();
  },
);

it.each([null, "invalid"])("does not request an invalid project: %s", async (id) => {
  await render({}, id);
  await run(() => current.refetch());
  expect(read).not.toHaveBeenCalled();
});

it("supports deferred loading with enabled", async () => {
  await render({ enabled: false });
  expect(read).not.toHaveBeenCalled();
  await render({ enabled: true });
  expect(current.isSuccess).toBe(true);
});

it("supports an initial cursor and limits retained pages with maxPages", async () => {
  const nextCursor = JSON.stringify({ version: 1, projectId, search: "", after: "b" });
  read.mockResolvedValueOnce(page(["b"], nextCursor)).mockResolvedValueOnce(page(["c"]));
  await render({ cursor, pageSize: 1, maxPages: 1 });
  expect(read.mock.calls[0][1]?.cursor).toBe(cursor);
  await run(() => current.fetchNextPage());
  expect(current.data?.pages).toEqual([page(["c"])]);
  expect(current.data?.pageParams).toEqual([nextCursor]);
});

it("exposes failures without automatic retries and supports refetch", async () => {
  read.mockResolvedValueOnce(null).mockResolvedValueOnce(page([]));
  await render();
  expect(current.isError).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  await run(() => current.refetch());
  expect(current.isSuccess).toBe(true);
  expect(current.hasNextPage).toBe(false);
});

it("keeps loaded pages when a continuation fails and retries the same cursor", async () => {
  read.mockResolvedValueOnce(page(["a"], cursor)).mockResolvedValueOnce(null).mockResolvedValueOnce(page(["b"]));
  await render();
  await run(() => current.loadMore()!);
  expect(current.isFetchNextPageError).toBe(true);
  expect(current.data?.pages).toEqual([page(["a"], cursor)]);
  expect(current.loadMore()).toBeUndefined();
  await run(() => current.retry()!);
  expect(read.mock.calls.map(([, params]) => params?.cursor)).toEqual([null, cursor, cursor]);
});

it("ignores load-more during an active fetch and after exhaustion", async () => {
  let finish: ((value: ProjectBranchPageSchema) => void) | undefined;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  expect(current.loadMore()).toBeUndefined();
  expect(current.retry()).toBeUndefined();
  expect(read).toHaveBeenCalledOnce();
  await act(async () => { finish?.(page([])); });
  await flush();
  expect(current.loadMore()).toBeUndefined();
  expect(read).toHaveBeenCalledOnce();
});

it("forwards cancellation to the action without showing a failure", async () => {
  let requestSignal: AbortSignal | undefined;
  read.mockImplementation((_id, _params, signal) => new Promise((resolve) => {
    requestSignal = signal;
    signal?.addEventListener("abort", () => resolve(null), { once: true });
  }));
  await render();
  await run(() => client.cancelQueries());
  expect(requestSignal?.aborted).toBe(true);
  expect(current.error).toBeNull();
});


it("recovers a stale cached list after leaving and remounting during workspace restoration", async () => {
  client.setDefaultOptions({ queries: { staleTime: 0 } });
  read.mockResolvedValueOnce(page(["feature/remote", "main"]));
  await render();
  await act(async () => { root.render(null); });
  read.mockImplementationOnce(async (_id, _params, _signal, onFailure) => {
    onFailure?.(503, "1", "WORKSPACE_RESTORING");
    return null;
  }).mockResolvedValueOnce(page(["feature/remote", "main"]));
  await render();
  expect(current.data?.pages[0].branches).toEqual(["feature/remote", "main"]);
  expect(current.error).toBeNull();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
  await flush();
  expect(current.isSuccess).toBe(true);
  expect(read).toHaveBeenCalledTimes(3);
  expect(read.mock.calls.every(([, params]) => params?.cursor === null)).toBe(true);
});

it("retries temporary server failures but stops after two retries", async () => {
  read.mockImplementation(async (_id, _params, _signal, onFailure) => {
    onFailure?.(502, null);
    return null;
  });
  await render();
  expect(current.error).toBeNull();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3200)); });
  await flush();
  expect(current.isError).toBe(true);
  expect(read).toHaveBeenCalledTimes(3);
});

it.each([401, 403, 429])("does not automatically retry HTTP %s", async (status) => {
  read.mockImplementation(async (_id, _params, _signal, onFailure) => {
    onFailure?.(status, null);
    return null;
  });
  await render();
  expect(current.isError).toBe(true);
  expect(read).toHaveBeenCalledOnce();
});


it("does not reuse cached pages from the former combined local and remote list", async () => {
  client.setQueryData([
    "projects", "branches", "infinite", "cursor", "user-one", projectId,
    { projectId, search: "", pageSize: 20, cursor: null },
  ], { pages: [page(["main", "remote-only"])], pageParams: [null] });
  read.mockResolvedValueOnce(page(["main"]));
  await render();
  expect(read).toHaveBeenCalledOnce();
  expect(current.data?.pages).toEqual([page(["main"])]);
});
