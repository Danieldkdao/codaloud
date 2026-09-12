// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PAGE_SIZE } from "@/lib/constants";
import { readGitHubRepositoryBranches } from "@/services/github/actions/actions";
import { useGitHubRepositoryBranches } from "@/services/github/hooks/use-github-repository-branches";
import type { GitHubRepositoryBranchPage } from "@/services/github/types";

const auth = vi.hoisted(() => ({ userId: "user-one" as string | null }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ data: auth.userId ? { user: { id: auth.userId } } : null, isPending: false, error: null }) }));
vi.mock("@/services/github/actions/actions", () => ({ readGitHubRepositoryBranches: vi.fn() }));
const read = vi.mocked(readGitHubRepositoryBranches);
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useGitHubRepositoryBranches>;

const Probe = ({ repositoryId = "123", ...options }: {
  repositoryId?: string | null;
  search?: string;
  pageSize?: number;
  enabled?: boolean;
}) => {
  // Track result fields during render so assertions receive query updates.
  current = { ...useGitHubRepositoryBranches(repositoryId, options) };
  return null;
};
const render = async (props: Parameters<typeof Probe>[0] = { enabled: false }) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, props)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const runQuery = async (operation: () => Promise<unknown>) => {
  await act(async () => {
    await operation();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const page = (names: string[], nextCursor: string | null): GitHubRepositoryBranchPage => ({
  branches: names.map((name) => ({ name, commitSha: "a".repeat(40), protected: false })),
  nextCursor,
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  read.mockReset();
  auth.userId = "user-one";
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useGitHubRepositoryBranches", () => {
  it("loads a valid repository automatically with the default page size", async () => {
    read.mockResolvedValue(page(["main"], null));
    await render({});
    expect(read).toHaveBeenCalledWith("123", {
      search: "", pageSize: PAGE_SIZE, cursor: null, signal: expect.any(AbortSignal),
    });
  });

  it.each([null, "", "invalid", "0"])("does not fetch for invalid repository ID %j, even on manual refetch", async (repositoryId) => {
    await render({ repositoryId });
    expect(read).not.toHaveBeenCalled();
    await runQuery(() => current.refetch());
    expect(current.isError).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("respects enabled and starts fetching when enabled", async () => {
    read.mockResolvedValue(page([], null));
    await render({ enabled: false });
    expect(read).not.toHaveBeenCalled();
    await render({ enabled: true });
    expect(read).toHaveBeenCalledOnce();
  });

  it("follows cursors through empty and partial pages until null", async () => {
    read.mockResolvedValueOnce(page([], "sixth"))
      .mockResolvedValueOnce(page(["one"], "seventh"))
      .mockResolvedValueOnce(page(["two", "three"], null));
    await render();
    await runQuery(() => current.refetch());
    expect(current.hasNextPage).toBe(true);
    await runQuery(() => current.fetchNextPage());
    expect(current.hasNextPage).toBe(true);
    await runQuery(() => current.fetchNextPage());
    expect(current.hasNextPage).toBe(false);
    await runQuery(() => current.fetchNextPage());
    expect(read.mock.calls.map(([, options]) => options?.cursor)).toEqual([null, "sixth", "seventh"]);
    expect(current.data?.pages.flatMap(({ branches }) => branches.map(({ name }) => name))).toEqual(["one", "two", "three"]);
  });

  it("normalizes search and separates repository, search, and page-size caches", async () => {
    read.mockImplementation(async (repositoryId) => page([repositoryId], "next"));
    await render({ search: " FEATURE ", enabled: false });
    await runQuery(() => current.refetch());
    await render({ search: "feature", enabled: false });
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(current.data?.pages).toEqual([page(["123"], "next")]);

    for (const props of [
      { repositoryId: "456", search: "feature" },
      { repositoryId: "456", search: "other" },
      { repositoryId: "456", search: "other", pageSize: 2 },
    ]) {
      await render({ ...props, enabled: false });
      expect(current.data).toBeUndefined();
      await runQuery(() => current.refetch());
    }
    expect(client.getQueryCache().getAll()).toHaveLength(4);
    expect(read.mock.calls.map(([id, options]) => [id, options?.search, options?.pageSize, options?.cursor])).toEqual([
      ["123", "feature", PAGE_SIZE, null],
      ["456", "feature", PAGE_SIZE, null],
      ["456", "other", PAGE_SIZE, null],
      ["456", "other", 2, null],
    ]);
  });

  it("exposes null action results as query errors", async () => {
    read.mockResolvedValue(null);
    await render();
    await runQuery(() => current.refetch());
    expect(current.isError).toBe(true);
    expect(current.data).toBeUndefined();
    expect(current.error?.message).toMatch(/Unable to load.*branches/);
  });

  it("retries a failed continuation without losing loaded branches", async () => {
    read.mockResolvedValueOnce(page(["main"], "retry-here"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(page(["develop"], null));
    await render();
    await runQuery(() => current.refetch());
    await runQuery(() => current.fetchNextPage());
    expect(current.isFetchNextPageError).toBe(true);
    expect(current.data?.pages).toEqual([page(["main"], "retry-here")]);
    await runQuery(() => current.fetchNextPage());
    expect(current.data?.pages).toHaveLength(2);
    expect(read.mock.calls.map(([, options]) => options?.cursor)).toEqual([null, "retry-here", "retry-here"]);
  });

  it("passes cancellation to the action", async () => {
    let requestSignal: AbortSignal | undefined;
    read.mockImplementation((_, { signal } = {}) => new Promise((resolve) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => resolve(null), { once: true });
    }));
    await render();
    let pending!: Promise<unknown>;
    await act(async () => { pending = current.refetch(); });
    expect(requestSignal?.aborted).toBe(false);
    await runQuery(async () => {
      await client.cancelQueries();
      await pending;
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(current.isError).toBe(false);
  });

  it("rebuilds cursors from fresh pages on refetch", async () => {
    read.mockResolvedValueOnce(page(["one"], "old"))
      .mockResolvedValueOnce(page(["two"], null))
      .mockResolvedValueOnce(page(["three"], "new"))
      .mockResolvedValueOnce(page(["four"], null));
    await render();
    await runQuery(() => current.refetch());
    await runQuery(() => current.fetchNextPage());
    await runQuery(() => current.refetch());
    expect(read.mock.calls.map(([, options]) => options?.cursor)).toEqual([null, "old", null, "new"]);
    expect(current.data?.pages).toEqual([page(["three"], "new"), page(["four"], null)]);
  });
});


it("isolates remote branches by account and blocks signed-out requests", async () => {
  read.mockResolvedValue(page(["private"], null));
  await render({});
  auth.userId = "user-two";
  await render({});
  expect(read).toHaveBeenCalledTimes(2);
  auth.userId = null;
  await render({});
  await runQuery(() => current.refetch());
  expect(read).toHaveBeenCalledTimes(2);
});
