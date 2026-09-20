// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createProjectCommitAction, readProjectCommitsAction } from "../actions/git-actions";
import { useProjectCommitHistory } from "../hooks/use-project-commit-history";
import type { ProjectCommitPageSchema } from "../actions/commit-schemas";
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("../actions/git-actions", () => ({ readProjectCommitsAction: vi.fn(), createProjectCommitAction: vi.fn() }));

const read = vi.mocked(readProjectCommitsAction);
const createCommit = vi.mocked(createProjectCommitAction);
const commitInput = { message: "Update files", paths: ["file.ts"] };
const createdCommit = { hash: "b".repeat(40), currentBranch: "main", parentHash: "a".repeat(40) };
const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const page = (message: string, nextCursor: string | null = null): ProjectCommitPageSchema => ({
  commits: [{ hash: "a".repeat(40), message, author: "Ada", authorEmail: "ada@example.com",
    committedAt: "2026-09-12T12:00:00Z", parentHashes: [], isMerge: false }],
  snapshotSha: "a".repeat(40), isShallow: false, nextCursor,
});
type Options = NonNullable<Parameters<typeof useProjectCommitHistory>[1]>;
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectCommitHistory>;
const Probe = ({ id, options }: { id: string | null; options: Options }) => {
  current = useProjectCommitHistory(id, options);
  return null;
};
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
const render = async (options: Options = {}, id: string | null = projectId) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, {
      id, options: { source: "local", branch: "main", ...options },
    })));
  });
  await flush();
};
const run = async (operation: () => unknown) => {
  await act(async () => { await operation(); });
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
  read.mockReset().mockResolvedValue(page("first"));
  createCommit.mockReset().mockResolvedValue({ error: false, message: "Committed.", data: createdCommit });
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

it("returns query results and loads through empty search pages until the cursor is exhausted", async () => {
  const empty = { ...page("unused", "cursor-two"), commits: [] };
  read.mockResolvedValueOnce(page("first", "cursor-one")).mockResolvedValueOnce(empty).mockResolvedValueOnce(page("last"));
  await render();
  expect(read).toHaveBeenCalledWith(projectId, { source: "local", branch: "main", search: "", author: "", pageSize: 20, cursor: null }, expect.any(AbortSignal), expect.any(Function));
  await run(() => current.onLoadMore());
  expect(current.hasNextPage).toBe(true);
  await run(() => current.onLoadMore());
  expect(current.data?.pages).toEqual([page("first", "cursor-one"), empty, page("last")]);
  expect(current.data?.pageParams).toEqual([null, "cursor-one", "cursor-two"]);
  expect(current.hasNextPage).toBe(false);
  expect(current.onLoadMore()).toBeUndefined();
  expect(read).toHaveBeenCalledTimes(3);
});

it("normalizes filters and starts each branch, source, author, search and page-size change from page one", async () => {
  await render({ search: " FIX ", author: " ADA " });
  await render({ search: "fix", author: "ada" });
  expect(read).toHaveBeenCalledOnce();
  await render({ branch: "feature" });
  await render({ source: "remote" });
  await render({ author: "bob" });
  await render({ search: "different" });
  await render({ pageSize: 5 });
  expect(read).toHaveBeenCalledTimes(6);
  expect(read.mock.calls.every(([, params]) => params.cursor === null)).toBe(true);
  expect(read.mock.calls[0][1]).toMatchObject({ search: "fix", author: "ada" });
  expect(client.getQueryCache().getAll()).toHaveLength(6);
});

it("isolates projects in the cache", async () => {
  read.mockResolvedValueOnce(page("one")).mockResolvedValueOnce(page("two")).mockResolvedValueOnce(page("three"));
  await render();
  await render({}, otherProjectId);
  expect(current.data?.pages).toEqual([page("two")]);
  await render();
  expect(current.data?.pages).toEqual([page("one")]);
  expect(client.getQueryCache().getAll()).toHaveLength(2);
});

it("works locally without an account or session", async () => { await render(); expect(read).toHaveBeenCalledOnce(); });

it.each<Options>([{ branch: undefined }, { source: undefined }, { branch: "main..private" },
  { pageSize: 0 }, { search: "x".repeat(201) }, { author: "x".repeat(201) }, { maxPages: -1 }, { maxPages: 1.5 }])(
  "validates options even for manual refetch: %j", async (options) => {
    await render(options);
    await run(() => current.refetch());
    expect(read).not.toHaveBeenCalled();
  },
);
it.each([null, "invalid"])("rejects invalid project %s", async (id) => {
  await render({}, id);
  await run(() => current.refetch());
  expect(read).not.toHaveBeenCalled();
});

it("supports enabled and guards callbacks while disabled", async () => {
  await render({ enabled: false });
  expect(current.onLoadMore()).toBeUndefined();
  expect(current.retry()).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
  await render({ enabled: true });
  expect(current.isSuccess).toBe(true);
});

it("limits retained pages with maxPages", async () => {
  read.mockResolvedValueOnce(page("one", "next")).mockResolvedValueOnce(page("two"));
  await render({ maxPages: 1 });
  await run(() => current.onLoadMore());
  expect(current.data?.pages).toEqual([page("two")]);
  expect(current.data?.pageParams).toEqual(["next"]);
});

it("exposes null as an error without automatic retries and retries the failed continuation", async () => {
  read.mockResolvedValueOnce(page("one", "next")).mockResolvedValueOnce(null).mockResolvedValueOnce(page("two"));
  await render();
  await run(() => current.onLoadMore());
  expect(current.isFetchNextPageError).toBe(true);
  expect(current.data?.pages).toEqual([page("one", "next")]);
  expect(current.onLoadMore()).toBeUndefined();
  await run(() => current.retry());
  expect(read.mock.calls.map(([, params]) => params.cursor)).toEqual([null, "next", "next"]);
  expect(current.isSuccess).toBe(true);
});

it.each(["INVALID_COMMIT_CURSOR", "HISTORY_SNAPSHOT_UNAVAILABLE"])("restarts from page one when retrying %s after retained pages were trimmed", async (code) => {
  read.mockResolvedValueOnce(page("old-one", "next")).mockResolvedValueOnce(page("old-two", "expired"))
    .mockImplementationOnce(async (_id, _params, _signal, onFailure) => { onFailure?.(409, null, code); return null; })
    .mockResolvedValueOnce(page("fresh"));
  await render({ maxPages: 1 });
  await run(() => current.onLoadMore());
  await run(() => current.onLoadMore());
  expect(current.isFetchNextPageError).toBe(true);
  await run(() => current.retry());
  expect(read.mock.calls.map(([, params]) => params.cursor)).toEqual([null, "next", "expired", null]);
  expect(current.data?.pages).toEqual([page("fresh")]);
});

it("guards callbacks during an active fetch and avoids duplicate load-more calls", async () => {
  let finish: ((value: ProjectCommitPageSchema) => void) | undefined;
  read.mockResolvedValueOnce(page("one", "next")).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  act(() => { void current.onLoadMore(); void current.onLoadMore(); });
  await flush();
  expect(current.onLoadMore()).toBeUndefined();
  expect(current.retry()).toBeUndefined();
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => { finish?.(page("two")); });
  await flush();
});

it("reads and refreshes local history while offline", async () => {
  onlineManager.setOnline(false);
  await render();
  expect(current.fetchStatus).toBe("idle");
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { await current.retry(); });
  expect(read).toHaveBeenCalledTimes(2);
});

it("forwards cancellation without showing an error", async () => {
  let signal: AbortSignal | undefined;
  read.mockImplementation((_id, _params, requestSignal) => new Promise((resolve) => {
    signal = requestSignal;
    requestSignal?.addEventListener("abort", () => resolve(null), { once: true });
  }));
  await render();
  await run(() => client.cancelQueries());
  expect(signal?.aborted).toBe(true);
  expect(current.error).toBeNull();
});

it("recovers a remounted cached history while the workspace is restoring", async () => {
  client.setDefaultOptions({ queries: { staleTime: 0 } });
  await render();
  await act(async () => { root.render(null); });
  read.mockImplementationOnce(async (_id, _params, _signal, onFailure) => {
    onFailure?.(503, "1", "WORKSPACE_RESTORING"); return null;
  }).mockResolvedValueOnce(page("restored"));
  await render();
  expect(current.data?.pages).toEqual([page("first")]);
  expect(current.error).toBeNull();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
  await flush();
  expect(current.data?.pages).toEqual([page("restored")]);
  expect(current.isSuccess).toBe(true);
});

it("limits transient server retries and supports retry after the initial failure", async () => {
  read.mockImplementation(async (_id, _params, _signal, onFailure) => { onFailure?.(502, null); return null; });
  await render();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3200)); });
  await flush();
  expect(current.isError).toBe(true);
  expect(read).toHaveBeenCalledTimes(3);
  read.mockResolvedValueOnce(page("recovered"));
  await run(() => current.retry());
  expect(current.isSuccess).toBe(true);
});

it.each([401, 403, 404, 409, 429])("does not automatically retry HTTP %s", async (status) => {
  read.mockImplementation(async (_id, _params, _signal, onFailure) => { onFailure?.(status, null); return null; });
  await render();
  expect(current.isError).toBe(true);
  expect(read).toHaveBeenCalledOnce();
});

it("exposes the full commit mutation and returns the confirmed commit", async () => {
  let finish!: (value: Awaited<ReturnType<typeof createProjectCommitAction>>) => void;
  createCommit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render({ enabled: false });
  let pending!: ReturnType<typeof current.gitCommit.mutateAsync>;
  await act(async () => { pending = current.gitCommit.mutateAsync(commitInput); });
  await flush();
  expect(current.gitCommit.isPending).toBe(true);
  expect(current.gitCommit.mutate).toEqual(expect.any(Function));
  expect(current.gitCommit.reset).toEqual(expect.any(Function));
  expect(createCommit).toHaveBeenCalledExactlyOnceWith(projectId, commitInput);
  await run(async () => {
    finish({ error: false, message: "Committed.", data: createdCommit });
    expect(await pending).toEqual(createdCommit);
  });
  expect(current.gitCommit.isPending).toBe(false);
  expect(current.gitCommit.error).toBeNull();
});

it("preserves action error codes and disables automatic commit retries", async () => {
  client.setDefaultOptions({ mutations: { retry: 3, retryDelay: 0 } });
  createCommit.mockResolvedValue({ error: true, message: "Refresh before retrying.", code: "COMMIT_OUTCOME_UNKNOWN" });
  await render();
  await run(async () => {
    await expect(current.gitCommit.mutateAsync(commitInput)).rejects.toMatchObject({ message: "Refresh before retrying.", code: "COMMIT_OUTCOME_UNKNOWN" });
  });
  expect(current.gitCommit.error).toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
  expect(createCommit).toHaveBeenCalledOnce();
});

it("works locally without an account or session", async () => { await render(); await run(() => current.gitCommit.mutateAsync(commitInput)); expect(createCommit).toHaveBeenCalledOnce(); });

it("blocks committing without a project", async () => {
  await render({}, null);
  await run(async () => { await expect(current.gitCommit.mutateAsync(commitInput)).rejects.toThrow("Invalid project ID."); });
  expect(createCommit).not.toHaveBeenCalled();
});

it("refreshes local history from page one after eviction and invalidates changed files", async () => {
  read.mockResolvedValueOnce(page("first", "next")).mockResolvedValueOnce(page("second")).mockResolvedValue(page("new commit"));
  const changesKey = ["projects", "changes", projectId];
  client.setQueryData(changesKey, { headSha: "a".repeat(40) });
  await render({ maxPages: 1 });
  await run(() => current.onLoadMore());
  await run(() => current.gitCommit.mutateAsync(commitInput));
  expect(read.mock.calls.map(([, input]) => input.cursor)).toEqual([null, "next", null]);
  expect(current.data?.pages).toEqual([page("new commit")]);
  expect(client.getQueryState(changesKey)?.isInvalidated).toBe(true);
});

it("refreshes the submitted project when navigation changes during a commit", async () => {
  let finish!: (value: Awaited<ReturnType<typeof createProjectCommitAction>>) => void;
  createCommit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const originalChanges = ["projects", "changes", projectId];
  const otherChanges = ["projects", "changes", otherProjectId];
  client.setQueryData(originalChanges, { changed: true });
  client.setQueryData(otherChanges, { changed: true });
  await render({ source: "remote" });
  const remoteKey = client.getQueryCache().getAll().find((query) => query.queryKey[1] === "commits")!.queryKey;
  await render();
  let pending!: ReturnType<typeof current.gitCommit.mutateAsync>;
  await act(async () => { pending = current.gitCommit.mutateAsync(commitInput); });
  await render({}, otherProjectId);
  await run(async () => {
    finish({ error: false, message: "Committed.", data: createdCommit });
    await pending;
  });
  expect(client.getQueryState(originalChanges)?.isInvalidated).toBe(true);
  expect(client.getQueryState(otherChanges)?.isInvalidated).toBe(false);
  expect(client.getQueryData(remoteKey)).toBeUndefined();
  expect(current.data?.pages).toEqual([page("first")]);
});

it("keeps a confirmed commit successful when refreshing queries fails", async () => {
  await render();
  const reset = vi.spyOn(client, "resetQueries").mockRejectedValueOnce(new Error("Refresh failed"));
  await run(async () => { expect(await current.gitCommit.mutateAsync(commitInput)).toEqual(createdCommit); });
  expect(current.gitCommit.error).toBeNull();
  reset.mockRestore();
});

it("does not queue an offline commit for execution after reconnecting", async () => {
  onlineManager.setOnline(false);
  createCommit.mockResolvedValue({ error: true, code: "COMMIT_REQUEST_UNAVAILABLE", message: "Unable to connect." });
  await render({ enabled: false });
  await run(async () => { await expect(current.gitCommit.mutateAsync(commitInput)).rejects.toThrow("Unable to connect."); });
  expect(createCommit).toHaveBeenCalledOnce();
  onlineManager.setOnline(true);
  await flush();
  expect(createCommit).toHaveBeenCalledOnce();
});

it("invalidates every file, directory and local branch query for the submitted workspace", async () => {
  const keys = (id: string) => [
    ["projects", "file", id, "file.ts"],
    ["projects", "file", id, "other.ts"],
    ["projects", "files", id, ""],
    ["projects", "files", id, "src/nested"],
    ["projects", "changes", id],
    ["projects", "branches", "infinite", "cursor", id, "local", { search: "" }],
  ];
  const affected = keys(projectId);
  const unrelated = [...keys("project-three"), ...keys(otherProjectId)];
  for (const key of [...affected, ...unrelated]) client.setQueryData(key, { cached: true });
  await render({ enabled: false });
  await run(() => current.gitCommit.mutateAsync(commitInput));
  for (const key of affected) {
    if (key[1] === "branches") expect(client.getQueryData(key)).toBeUndefined();
    else {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryData(key)).toEqual({ cached: true });
    }
  }
  for (const key of unrelated) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});

it("discards old file-search snapshots without resetting other workspaces", async () => {
  const searchKey = ["projects", "file-search", "infinite", projectId, { search: "text" }];
  const otherKey = ["projects", "file-search", "infinite", otherProjectId, { search: "text" }];
  for (const key of [searchKey, otherKey]) client.setQueryData(key, { pages: ["old snapshot"], pageParams: [null] });
  await render({ enabled: false });
  await run(() => current.gitCommit.mutateAsync(commitInput));
  expect(client.getQueryData(searchKey)).toBeUndefined();
  expect(client.getQueryData(otherKey)).toBeDefined();
});

it("cancels an older individual-file read and refetches its contents and stats", async () => {
  const queryKey = ["projects", "file", projectId, "file.ts"];
  const refreshed = { content: "later edit", stats: { staged: false, modified: true } };
  let finishOldRead!: (value: typeof refreshed) => void;
  let oldSignal!: AbortSignal;
  const readFile = vi.fn<({ signal }: { signal: AbortSignal }) => Promise<typeof refreshed>>()
    .mockImplementationOnce(({ signal }) => {
      oldSignal = signal;
      return new Promise((resolve) => { finishOldRead = resolve; });
    }).mockResolvedValue(refreshed);
  const observer = new QueryObserver(client, { queryKey, queryFn: readFile, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await render({ enabled: false });
    await run(() => current.gitCommit.mutateAsync(commitInput));
    expect(oldSignal.aborted).toBe(true);
    await run(() => finishOldRead({ content: "older bytes", stats: { staged: true, modified: false } }));
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(queryKey)).toEqual(refreshed);
  } finally { unsubscribe(); }
});

it.each(["COMMIT_FAILED", "COMMIT_OUTCOME_UNKNOWN", "COMMIT_STAGING_OUTCOME_UNKNOWN"])(
  "refreshes potentially changed staging after %s while preserving the commit error", async (code) => {
    const key = ["projects", "file", projectId, "file.ts"];
    const changesKey = ["projects", "changes", projectId];
    for (const queryKey of [key, changesKey]) client.setQueryData(queryKey, { staged: false });
    createCommit.mockResolvedValue({ error: true, code, message: "Refresh before retrying." });
    await render({ enabled: false });
    await run(async () => { await expect(current.gitCommit.mutateAsync(commitInput)).rejects.toMatchObject({ code }); });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(changesKey)?.isInvalidated).toBe(true);
    expect(current.gitCommit.error).toMatchObject({ code });
    expect(createCommit).toHaveBeenCalledOnce();
  },
);
