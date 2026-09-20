// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectFileSearch } from "../hooks/use-project-file-search";
import type { ProjectFileSearchPageSchema } from "../actions/file-search-schemas";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  flushSaves: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("../actions/file-actions", () => ({ readProjectFilesAction: mocks.read }));
vi.mock("../hooks/use-project-file-save", () => ({
  useProjectFileSaveRegistry: () => ({ flushPendingSaves: mocks.flushSaves }),
}));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const cursor = "12345678-1234-4123-8123-123456789abc:10:" + "a".repeat(64);
const freshCursor = "12345678-1234-4123-8123-123456789abd:10:" + "b".repeat(64);
const page = (path: string, nextCursor: string | null = null): ProjectFileSearchPageSchema => ({
  files: [{ path, titleMatches: true, contentMatchCount: 150, contentSearched: true }],
  totalCount: 2, nextCursor, skippedContentFiles: 0,
  searchedAt: "2026-09-13T00:00:00.000Z", expiresAt: "2026-09-13T00:02:00.000Z",
});
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectFileSearch>;
type Options = NonNullable<Parameters<typeof useProjectFileSearch>[1]>;
const Probe = ({ id, options }: { id: string | null; options: Options }) => {
  // Read the result properties during render, as the consuming UI will do.
  current = { ...useProjectFileSearch(id, options) };
  return null;
};
const flush = async (ms = 1) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
};
const render = async (options: Options = { search: "needle" }, id: string | null = projectId) => {
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { id, options }))); });
  await flush();
};
const fail = (status: number, code?: string, retryAfter: string | null = null) =>
  async (_id: string, _input: unknown, _signal: AbortSignal, _restoring: unknown, onFailure: (status: number, retryAfter: string | null, code?: string) => void) => {
    onFailure(status, retryAfter, code);
    return null;
  };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
  mocks.read.mockReset().mockResolvedValue(page("first.ts", cursor));
  mocks.flushSaves.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("returns infinite-query pages and forwards the server cursor and filters", async () => {
  await render({ search: " needle ", scope: "content", path: "src", pageSize: 10 });
  expect(mocks.read).toHaveBeenCalledWith(projectId, { search: " needle ", scope: "content", path: "src", pageSize: 10, cursor: undefined }, expect.any(AbortSignal), undefined, expect.any(Function));
  expect(current.data?.pages[0].files[0].contentMatchCount).toBe(150);
  expect(current.hasNextPage).toBe(true);
  mocks.read.mockResolvedValueOnce(page("second.ts"));
  await act(async () => { await current.fetchNextPage({ cancelRefetch: false }); });
  await flush();
  expect(mocks.read.mock.lastCall?.[1].cursor).toBe(cursor);
  expect(current.data?.pages.map((value) => value.files[0].path)).toEqual(["first.ts", "second.ts"]);
  expect(current.data?.pageParams).toEqual([null, cursor]);
  expect(current.hasNextPage).toBe(false);
});

it("waits for saves before first-page scans and refreshes, but not continuation pages", async () => {
  let finish!: () => void;
  mocks.flushSaves.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await render();
  expect(current.isFetching).toBe(true);
  expect(mocks.read).not.toHaveBeenCalled();
  await act(async () => finish());
  await flush();
  expect(mocks.read).toHaveBeenCalledOnce();
  await act(async () => { await current.fetchNextPage(); });
  expect(mocks.flushSaves).toHaveBeenCalledOnce();
  await act(async () => { await current.refetch(); });
  expect(mocks.flushSaves).toHaveBeenCalledTimes(2);
});

it("surfaces save failures without starting or automatically retrying a search", async () => {
  mocks.flushSaves.mockRejectedValue(new Error("Save failed. Open Code to retry."));
  await render();
  await flush(30_000);
  expect(current.error?.message).toBe("Save failed. Open Code to retry.");
  expect(mocks.flushSaves).toHaveBeenCalledOnce();
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.flushSaves.mockResolvedValue(undefined);
  await act(async () => { await current.refetch(); });
  await flush();
  expect(current.isSuccess).toBe(true);
});

it.each(["query", "unmount"])("does not send an obsolete search after saves settle on %s change", async (change) => {
  let finish!: () => void;
  mocks.flushSaves.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await render();
  expect(mocks.read).not.toHaveBeenCalled();
  if (change === "unmount") {
    await act(async () => root.render(null));
  } else {
    await render({ search: "new query" });
  }
  await act(async () => finish());
  await flush();
  expect(mocks.read).toHaveBeenCalledTimes(change === "unmount" ? 0 : 1);
  if (change !== "unmount") expect(mocks.read.mock.lastCall?.[1].search).toBe("new query");
});

it.each(["", "   ", "\0", "x".repeat(257)])("does not request an invalid search %j, even on manual refetch", async (search) => {
  await render({ search });
  await act(async () => { await current.refetch(); });
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([
  ["x".repeat(257), "Shorten your search to 256 characters or fewer."],
  ["text\0", "Remove unsupported characters from your search."],
  ["   ", "Enter a search term."],
])("exposes actionable validation for %j without a request", async (search, message) => {
  await render({ search });
  expect(current.validationError).toBe(message);
  expect(current.fetchStatus).toBe("idle");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.flushSaves).not.toHaveBeenCalled();
  await act(async () => { await current.refetch(); });
  await flush();
  expect(current.error?.message).toBe(message);
  expect(mocks.read).not.toHaveBeenCalled();
});

it("clears validation when input is corrected and preserves the 256-character literal", async () => {
  await render({ search: "x".repeat(257) });
  expect(current.validationError).not.toBeNull();
  const search = " " + "x".repeat(254) + " ";
  await render({ search });
  expect(current.validationError).toBeNull();
  expect(current.isSuccess).toBe(true);
  expect(mocks.read.mock.lastCall?.[1].search).toBe(search);
});

it("does not expose validation for the disabled empty query used during typing", async () => {
  await render({ search: "", enabled: false });
  expect(current.validationError).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("requires a valid project and enabled observer", async () => {
  await render({ search: "needle" }, null);
  await render({ search: "needle" }, "invalid");
  await render({ search: "needle", pageSize: 0 });
  await render({ search: "needle", enabled: false });
  expect(mocks.read).not.toHaveBeenCalled();
});

it("starts fresh and cancels the obsolete request when filters or project change", async () => {
  mocks.read.mockImplementationOnce(() => new Promise(() => {}));
  await render();
  const signal = mocks.read.mock.calls[0][2] as AbortSignal;
  await render({ search: "next", scope: "title", path: "src", pageSize: 20 });
  expect(signal.aborted).toBe(true);
  expect(mocks.read.mock.lastCall?.[1]).toEqual({ search: "next", scope: "title", path: "src", pageSize: 20, cursor: undefined });
  await render({ search: "next", scope: "title", path: "src", pageSize: 20 }, "22222222-2222-4222-8222-222222222222");
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(current.data?.pageParams).toEqual([null]);
  expect(mocks.flushSaves).toHaveBeenCalledTimes(3);
});

it.each([0, 429, 502])("retries transient failure %s twice with backoff", async (status) => {
  mocks.read.mockImplementation(fail(status));
  await render();
  await flush(999);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  await flush(2001);
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(current.isError).toBe(true);
  await flush(30_000);
  expect(mocks.read).toHaveBeenCalledTimes(3);
  mocks.read.mockResolvedValue(page("recovered.ts"));
  await act(async () => { await current.refetch(); });
  await flush();
  expect(current.isSuccess).toBe(true);
});

it("keeps retrying workspace restoration using Retry-After and stops on success", async () => {
  mocks.read.mockImplementation(fail(503, "WORKSPACE_RESTORING", "3"));
  await render();
  await flush(12_000);
  expect(mocks.read).toHaveBeenCalledTimes(5);
  expect(current.isPending).toBe(true);
  mocks.read.mockResolvedValue(page("restored.ts"));
  await flush(3001);
  expect(current.isSuccess).toBe(true);
});

it.each([401, 403, 413])("does not retry terminal failure %s", async (status) => {
  mocks.read.mockImplementation(fail(status));
  await render();
  await flush(30_000);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(current.isError).toBe(true);
});

it.each([
  [413, "SEARCH_LIMIT_EXCEEDED", "This search is too large. Use a more specific search."],
  [410, "SEARCH_SESSION_EXPIRED", "These search results expired. Try again to refresh them."],
  [400, "INVALID_SEARCH_CURSOR", "These search results are no longer valid. Try again to refresh them."],
  [409, "SEARCH_WORKSPACE_CHANGED", "Workspace files changed. Try again to refresh the search."],
  [409, "WORKSPACE_NOT_READY", "Your workspace is not ready yet. Reopen the project, then try again."],
  [400, "INVALID_FILE_SEARCH", "This search could not be accepted. Change your search and try again."],
  [400, "INVALID_PATH", "The search folder is unavailable. Reopen the project and try again."],
] as const)("shows recovery guidance for %s %s without automatic retries", async (status, code, message) => {
  mocks.read.mockImplementation(fail(status, code));
  await render();
  await flush(30_000);
  expect(current.error?.message).toBe(message);
  expect(mocks.read).toHaveBeenCalledOnce();
});

it.each([
  [503, "SEARCH_BUSY", "File search is busy. Please try again shortly."],
  [502, "SEARCH_UNAVAILABLE", "File search is temporarily unavailable. Please try again."],
] as const)("retains bounded retries before showing %s %s guidance", async (status, code, message) => {
  mocks.read.mockImplementation(fail(status, code));
  await render();
  await flush(30_000);
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(current.error?.message).toBe(message);
});

it.each([undefined, "UNRECOGNIZED_CODE"])("uses a safe fallback for an unknown error code (%s)", async (code) => {
  mocks.read.mockImplementation(fail(400, code));
  await render();
  expect(current.error?.message).toBe("Unable to search project files. Please try again.");
});

it.each([[410, "SEARCH_SESSION_EXPIRED"], [409, "SEARCH_WORKSPACE_CHANGED"], [400, "INVALID_SEARCH_CURSOR"]])("replaces the whole result set when a continuation fails with %s %s", async (status, code) => {
  await render();
  mocks.read.mockImplementationOnce(fail(status, code)).mockResolvedValueOnce(page("fresh.ts"));
  await act(async () => { await current.fetchNextPage({ cancelRefetch: false }); });
  await flush();
  await flush();
  expect(mocks.read.mock.calls.map((call) => call[1].cursor)).toEqual([undefined, cursor, undefined]);
  expect(current.data?.pages.map((value) => value.files[0].path)).toEqual(["fresh.ts"]);
  expect(current.data?.pageParams).toEqual([null]);
  expect(mocks.flushSaves).toHaveBeenCalledTimes(2);
});

it("does not loop when the new first page also fails", async () => {
  await render();
  mocks.read.mockImplementation(fail(409, "SEARCH_WORKSPACE_CHANGED"));
  await act(async () => { await current.fetchNextPage(); });
  await flush(30_000);
  await flush();
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(current.isError).toBe(true);
});

it("keeps loaded pages on a pagination failure so fetchNextPage can retry", async () => {
  await render();
  mocks.read.mockImplementationOnce(fail(413, "SEARCH_LIMIT_EXCEEDED"));
  await act(async () => { await current.fetchNextPage(); });
  await flush();
  expect(current.isFetchNextPageError).toBe(true);
  expect(current.data?.pages).toHaveLength(1);
  mocks.read.mockResolvedValueOnce(page("retry.ts"));
  await act(async () => { await current.fetchNextPage(); });
  await flush();
  expect(current.data?.pages).toHaveLength(2);
  expect(current.isError).toBe(false);
});

it("refetches from page one and follows fresh cursors while retaining visible results", async () => {
  await render();
  mocks.read.mockResolvedValueOnce(page("second.ts"));
  await act(async () => { await current.fetchNextPage(); });
  await flush();
  let resolvePage!: (value: ProjectFileSearchPageSchema) => void;
  mocks.read.mockImplementationOnce(() => new Promise((resolve) => { resolvePage = resolve; }))
    .mockResolvedValueOnce(page("new-second.ts"));
  let pending!: ReturnType<typeof current.refetch>;
  await act(async () => { pending = current.refetch(); });
  await flush();
  expect(current.isRefetching).toBe(true);
  expect(current.data?.pages).toHaveLength(2);
  await act(async () => { resolvePage(page("new-first.ts", freshCursor)); await pending; });
  await flush();
  expect(mocks.read.mock.calls.slice(-2).map((call) => call[1].cursor)).toEqual([undefined, freshCursor]);
  expect(current.data?.pages.map((value) => value.files[0].path)).toEqual(["new-first.ts", "new-second.ts"]);
});

it("refreshes when app focus returns without polling while idle", async () => {
  await render();
  await flush(60_000);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await flush();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
