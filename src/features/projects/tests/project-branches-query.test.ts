// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkoutProjectBranchAction, readProjectBranchesAction } from "../actions/git-actions";
import { useProjectBranches } from "../hooks/use-project-branches";
import type { ProjectBranchPageSchema } from "../actions/branch-schemas";

const session = vi.hoisted(() => ({
  data: { user: { id: "user-one" } } as { user: { id: string } } | null,
  isPending: false,
  error: null as Error | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("../actions/git-actions", () => ({ readProjectBranchesAction: vi.fn(), checkoutProjectBranchAction: vi.fn() }));

const read = vi.mocked(readProjectBranchesAction);
const checkout = vi.mocked(checkoutProjectBranchAction);
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
  checkout.mockReset().mockResolvedValue({
    error: false,
    message: "Branch checked out successfully.",
    data: { previousBranch: "main", currentBranch: "feature/checkout" },
  });
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

it("exposes checkout pending and success states and returns confirmed branch data", async () => {
  let finish!: (value: Awaited<ReturnType<typeof checkoutProjectBranchAction>>) => void;
  checkout.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render({ enabled: false });
  let request!: ReturnType<typeof current.checkout.mutateAsync>;
  await act(async () => { request = current.checkout.mutateAsync({ branchName: "feature/checkout" }); });
  await flush();
  expect(current.checkout.isPending).toBe(true);
  expect(checkout).toHaveBeenCalledExactlyOnceWith(projectId, { branchName: "feature/checkout" });
  const data = { previousBranch: "main", currentBranch: "feature/checkout" };
  await run(async () => {
    finish({ error: false, message: "Branch checked out successfully.", data });
    expect(await request).toEqual(data);
  });
  expect(current.checkout.isSuccess).toBe(true);
  expect(current.checkout.data).toEqual(data);
});

it("exposes actionable checkout errors and does not inherit automatic retries", async () => {
  client.setDefaultOptions({ mutations: { retry: 3, retryDelay: 0 } });
  const failure = { error: true as const, message: "Commit or stash your changes.", code: "CHECKOUT_CHANGES_CONFLICT" };
  checkout.mockResolvedValueOnce(failure);
  await render({ enabled: false });
  await run(async () => {
    await expect(current.checkout.mutateAsync({ branchName: "feature/checkout" })).rejects.toMatchObject({
      message: failure.message, code: failure.code,
    });
  });
  expect(current.checkout.isError).toBe(true);
  expect(current.checkout.error).toMatchObject({ message: failure.message, code: failure.code });
  expect(checkout).toHaveBeenCalledOnce();
});

it.each(["pending", "signed-out", "error"])("blocks checkout while authentication is %s", async (state) => {
  if (state === "pending") session.isPending = true;
  if (state === "signed-out") session.data = null;
  if (state === "error") session.error = new Error("Session unavailable");
  await render();
  await run(async () => {
    await expect(current.checkout.mutateAsync({ branchName: "feature/checkout" })).rejects.toThrow("Sign in to switch branches.");
  });
  expect(checkout).not.toHaveBeenCalled();
});

it("rejects checkout without a project", async () => {
  await render({}, null);
  await run(async () => {
    await expect(current.checkout.mutateAsync({ branchName: "feature/checkout" })).rejects.toThrow("Invalid project ID.");
  });
  expect(checkout).not.toHaveBeenCalled();
});

it("uses the current project after navigation independently of branch query filters", async () => {
  await render({ enabled: false });
  await render({ enabled: false, cursor: "invalid", search: "x".repeat(201) }, otherProjectId);
  await run(() => current.checkout.mutateAsync({ branchName: "feature/checkout" }));
  expect(checkout).toHaveBeenCalledExactlyOnceWith(otherProjectId, { branchName: "feature/checkout" });
  expect(client.getMutationCache().getAll()[0].options.mutationKey)
    .toEqual(["projects", "branches", "checkout", "user-one", otherProjectId]);
});

it("refreshes active changes after checkout even when their stale time is infinite", async () => {
  const queryKey = ["projects", "changes", "user-one", projectId];
  client.setQueryData(queryKey, { currentBranch: "main" });
  const readChanges = vi.fn().mockResolvedValue({ currentBranch: "feature/checkout" });
  const observer = new QueryObserver(client, { queryKey, queryFn: readChanges, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await render({ enabled: false });
    expect(readChanges).not.toHaveBeenCalled();
    await run(() => current.checkout.mutateAsync({ branchName: "feature/checkout" }));
    expect(readChanges).toHaveBeenCalledOnce();
    expect(client.getQueryData(queryKey)).toEqual({ currentBranch: "feature/checkout" });
  } finally { unsubscribe(); }
});

it("marks only the submitted account and project's inactive changes stale after navigation", async () => {
  const originalKey = ["projects", "changes", "user-one", projectId];
  const otherProjectKey = ["projects", "changes", "user-one", otherProjectId];
  const otherAccountKey = ["projects", "changes", "user-two", projectId];
  for (const queryKey of [originalKey, otherProjectKey, otherAccountKey]) client.setQueryData(queryKey, { currentBranch: "main" });
  let finish!: (value: Awaited<ReturnType<typeof checkoutProjectBranchAction>>) => void;
  checkout.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render({ enabled: false });
  let pending!: ReturnType<typeof current.checkout.mutateAsync>;
  await act(async () => { pending = current.checkout.mutateAsync({ branchName: "feature/checkout" }); });
  session.data = { user: { id: "user-two" } };
  await render({ enabled: false }, otherProjectId);
  await run(async () => {
    finish({ error: false, message: "Checked out.", data: { previousBranch: "main", currentBranch: "feature/checkout" } });
    await pending;
  });
  expect(client.getQueryState(originalKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(otherProjectKey)?.isInvalidated).toBe(false);
  expect(client.getQueryState(otherAccountKey)?.isInvalidated).toBe(false);
});

it("keeps the changes snapshot valid when checkout fails", async () => {
  const queryKey = ["projects", "changes", "user-one", projectId];
  client.setQueryData(queryKey, { currentBranch: "main" });
  checkout.mockResolvedValueOnce({ error: true, message: "Commit or stash your changes." });
  await render({ enabled: false });
  await run(async () => { await expect(current.checkout.mutateAsync({ branchName: "feature/checkout" })).rejects.toThrow("Commit or stash"); });
  expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
  expect(client.getQueryData(queryKey)).toEqual({ currentBranch: "main" });
});

it("refreshes changes after an unknown checkout outcome without retrying the checkout", async () => {
  const queryKey = ["projects", "changes", "user-one", projectId];
  client.setQueryData(queryKey, { currentBranch: "main" });
  const readChanges = vi.fn().mockResolvedValue({ currentBranch: "feature/checkout" });
  const observer = new QueryObserver(client, { queryKey, queryFn: readChanges, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  checkout.mockResolvedValueOnce({ error: true, code: "CHECKOUT_OUTCOME_UNKNOWN", message: "Response lost." });
  try {
    await render({ enabled: false });
    await run(async () => {
      await expect(current.checkout.mutateAsync({ branchName: "feature/checkout" })).rejects.toThrow("Response lost");
    });
    expect(checkout).toHaveBeenCalledOnce();
    expect(readChanges).toHaveBeenCalledOnce();
    expect(client.getQueryData(queryKey)).toEqual({ currentBranch: "feature/checkout" });
  } finally { unsubscribe(); }
});

it("replaces an unfinished changes read started before checkout", async () => {
  const queryKey = ["projects", "changes", "user-one", projectId];
  let finishOldRead!: (value: { currentBranch: string }) => void;
  let oldSignal!: AbortSignal;
  const readChanges = vi.fn<({ signal }: { signal: AbortSignal }) => Promise<{ currentBranch: string }>>().mockImplementationOnce(({ signal }) => {
    oldSignal = signal;
    return new Promise((resolve) => { finishOldRead = resolve; });
  }).mockResolvedValue({ currentBranch: "feature/checkout" });
  const observer = new QueryObserver(client, { queryKey, queryFn: readChanges, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await render({ enabled: false });
    let pending!: ReturnType<typeof current.checkout.mutateAsync>;
    await act(async () => { pending = current.checkout.mutateAsync({ branchName: "feature/checkout" }); });
    const cancelled = oldSignal.aborted;
    await run(async () => { finishOldRead({ currentBranch: "main" }); await pending; });
    expect(cancelled).toBe(true);
    expect(readChanges).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(queryKey)).toEqual({ currentBranch: "feature/checkout" });
  } finally { unsubscribe(); }
});
