// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { readUserProjectsAction } from "@/features/projects/actions/actions";
import { useProjects } from "@/features/projects/hooks/use-projects";
import type { ProjectParamsSchema } from "@/features/projects/lib/project-params";
import type { ProjectPageData } from "@/features/projects/types";

const session = vi.hoisted(() => ({
  data: { user: { id: "user-one" } },
  isPending: false,
  error: null as Error | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("@/features/projects/actions/actions", () => ({ readUserProjectsAction: vi.fn() }));

const read = vi.mocked(readUserProjectsAction);
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjects>;
const page = (ids: string[], nextCursor: string | null = null): ProjectPageData => ({ projects: ids.map((id) => ({
  id, userId: "user-one", name: id, sandboxId: null, setupStatus: "pending",
  setupError: null, githubRepositoryId: null, lastOpenedFilePath: null,
  lastOpenedAt: null, createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
})), nextCursor });

const Probe = ({ filters }: { filters: Partial<ProjectParamsSchema> }) => {
  current = { ...useProjects(filters) };
  return null;
};
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
const render = async (filters: Partial<ProjectParamsSchema> = {}) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client },
      createElement(Probe, { filters: { pageSize: 2, ...filters } })));
  });
  await flush();
};
const run = async (operation: () => Promise<unknown>) => {
  await act(async () => { await operation(); });
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
  session.data = { user: { id: "user-one" } };
  session.isPending = false;
  session.error = null;
  read.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useProjects", () => {
  it("loads projects when the runtime signal has no throwIfAborted method", async () => {
    read.mockImplementation(async (_params, signal) => {
      // React Native's abort-controller polyfill lacks this newer browser API.
      Object.defineProperty(signal, "throwIfAborted", { value: undefined });
      return page(["a"]);
    });
    await render();
    expect(current.error).toBeNull();
    expect(current.data?.pages).toEqual([page(["a"])]);
  });

  it("follows server cursors and stops on a full final page", async () => {
    read.mockResolvedValueOnce(page(["a", "b"], "after-b"))
      .mockResolvedValueOnce(page(["c", "d"]));
    await render();
    expect(current.hasNextPage).toBe(true);
    await run(() => current.fetchNextPage());
    expect(current.hasNextPage).toBe(false);
    await run(() => current.fetchNextPage());
    expect(read.mock.calls.map(([params]) => params?.cursor)).toEqual([null, "after-b"]);
    expect(current.data?.pages.flatMap((page) => page.projects)).toEqual(page(["a", "b", "c", "d"]).projects);
    expect(current.data?.pageParams).toEqual([null, "after-b"]);
  });

  it("rebuilds continuation cursors from fresh results on refresh", async () => {
    read.mockResolvedValueOnce(page(["a", "b"], "old-boundary"))
      .mockResolvedValueOnce(page(["c"]))
      .mockResolvedValueOnce(page(["new", "a"], "new-boundary"))
      .mockResolvedValueOnce(page(["b", "c"]));
    await render();
    await run(() => current.fetchNextPage());
    await run(() => current.refetch());
    expect(read.mock.calls.map(([params]) => params?.cursor)).toEqual([null, "old-boundary", null, "new-boundary"]);
    expect(current.data?.pages.flatMap((page) => page.projects)).toEqual(page(["new", "a", "b", "c"]).projects);
  });

  it("exposes null as an error and can refetch successfully", async () => {
    read.mockResolvedValueOnce(null).mockResolvedValueOnce(page([]));
    await render();
    expect(current.isError).toBe(true);
    expect(current.error?.message).toBe("Unable to load projects. Please try again.");
    expect(current.data).toBeUndefined();
    await run(() => current.refetch());
    expect(current.isSuccess).toBe(true);
    expect(current.hasNextPage).toBe(false);
  });

  it("preserves loaded pages and retries a failed continuation", async () => {
    read.mockResolvedValueOnce(page(["a", "b"], "after-b"))
      .mockResolvedValueOnce(null).mockResolvedValueOnce(page(["c"]));
    await render();
    await run(() => current.fetchNextPage());
    expect(current.isFetchNextPageError).toBe(true);
    expect(current.data?.pages).toEqual([page(["a", "b"], "after-b")]);
    await run(() => current.fetchNextPage());
    expect(read.mock.calls.map(([params]) => params?.cursor)).toEqual([null, "after-b", "after-b"]);
  });

  it.each<Partial<ProjectParamsSchema>>([
    { search: "other" }, { sortBy: "name" }, { sortOrder: "asc" }, { pageSize: 5 },
  ])("fetches separate results when filters change: %j", async (filters) => {
    read.mockResolvedValueOnce(page(["a"])).mockResolvedValueOnce(page(["b"]));
    await render();
    await render(filters);
    expect(read).toHaveBeenCalledTimes(2);
    expect(current.data?.pages).toEqual([page(["b"])]);
    expect(client.getQueryCache().getAll()).toHaveLength(2);
    expect(read.mock.calls.at(-1)?.[0]?.cursor).toBeNull();
  });

  it("shares normalized search keys and starts a different search from its first page", async () => {
    read.mockResolvedValueOnce(page(["a", "b"])).mockResolvedValueOnce(page(["c"]));
    await render({ search: " match " });
    await render({ search: "match" });
    expect(read).toHaveBeenCalledOnce();
    await render({ search: "different" });
    expect(read.mock.calls.map(([params]) => [params?.search, params?.cursor]))
      .toEqual([["match", null], ["different", null]]);
    expect(current.data?.pages).toEqual([page(["c"])]);
  });

  it("waits for authentication and isolates account changes", async () => {
    session.isPending = true;
    await render();
    expect(read).not.toHaveBeenCalled();
    await run(() => current.refetch());
    expect(read).not.toHaveBeenCalled();
    read.mockResolvedValueOnce(page(["a"])).mockResolvedValueOnce(page(["b"]));
    session.isPending = false;
    await render();
    expect(current.data?.pages).toEqual([page(["a"])]);
    session.data = { user: { id: "user-two" } };
    await render();
    expect(current.data?.pages).toEqual([page(["b"])]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("forwards cancellation to the read action", async () => {
    let requestSignal: AbortSignal | undefined;
    read.mockImplementation((_params, signal) => new Promise((resolve) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => resolve(null), { once: true });
    }));
    await render();
    expect(current.isPending).toBe(true);
    expect(requestSignal?.aborted).toBe(false);
    await run(() => client.cancelQueries({ queryKey: ["projects"] }));
    expect(requestSignal?.aborted).toBe(true);
    expect(current.data).toBeUndefined();
    expect(current.error).toBeNull();
  });
});
