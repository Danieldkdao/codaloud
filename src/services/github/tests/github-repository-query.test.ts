// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGitHubRepositories } from "@/services/github/hooks/use-github-repositories";
import { readGitHubRepositories } from "@/services/github/actions/actions";
import type { GitHubRepositoryPage } from "@/services/github/types";

vi.mock("@/services/github/actions/actions", () => ({ readGitHubRepositories: vi.fn() }));
vi.mock("../hooks/use-github-profile", () => ({ useGitHubProfile: () => ({ ready: true, profile: { id: 1 }, scopes: ["repo"] }) }));
const read = vi.mocked(readGitHubRepositories);
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useGitHubRepositories>;
const Probe = ({ search, enabled }: { search: string; enabled: boolean }) => {
  // Track result fields during render so updates reach the test's assertions.
  current = { ...useGitHubRepositories({ search, pageSize: 2, enabled }) };
  return null;
};
const render = async (search = "match", enabled = false) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { search, enabled })));
  });
};
const runQuery = async (operation: () => Promise<unknown>) => {
  await act(async () => {
    await operation();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const page = (ids: number[], nextCursor: string | null): GitHubRepositoryPage => ({
  repositories: ids.map((id) => ({
    id, name: `repo-${id}`, fullName: `owner/repo-${id}`, description: null,
    private: true, archived: false, defaultBranch: "main", cloneUrl: "", htmlUrl: "",
    permissions: { pull: true, push: false, admin: false },
  })),
  nextCursor,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  read.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("repository infinite queries", () => {
  it("uses server cursors through empty, partial, and full final pages", async () => {
    read.mockResolvedValueOnce(page([], "sixth"))
      .mockResolvedValueOnce(page([1], "seventh"))
      .mockResolvedValueOnce(page([2, 3], null));
    await render();
    await runQuery(() => current.refetch());
    expect(current.hasNextPage).toBe(true);
    await runQuery(() => current.fetchNextPage());
    expect(current.hasNextPage).toBe(true);
    await runQuery(() => current.fetchNextPage());
    expect(current.hasNextPage).toBe(false);
    await runQuery(() => current.fetchNextPage());
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "sixth", "seventh"]);
    expect(current.data?.pages.flatMap((p) => p.repositories.map((r) => r.id))).toEqual([1, 2, 3]);
  });

  it("retries a failed continuation without discarding loaded results", async () => {
    read.mockResolvedValueOnce(page([1], "retry-here"))
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce(page([2], null));
    await render();
    await runQuery(() => current.refetch());
    await runQuery(() => current.fetchNextPage());
    expect(current.isFetchNextPageError).toBe(true);
    expect(current.data?.pages).toEqual([page([1], "retry-here")]);
    await runQuery(() => current.fetchNextPage());
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "retry-here", "retry-here"]);
    expect(current.data?.pages).toHaveLength(2);
  });

  it("normalizes search keys and starts a different search from its own first page", async () => {
    read.mockResolvedValueOnce(page([1], "first-search"))
      .mockResolvedValueOnce(page([2], null));
    await render(" MATCH ");
    await runQuery(() => current.refetch());
    await render("match");
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(current.data?.pages).toEqual([page([1], "first-search")]);
    await render("different");
    await runQuery(() => current.refetch());
    expect(read.mock.calls.map(([options]) => [options?.search, options?.cursor])).toEqual([["match", null], ["different", null]]);
    expect(current.data?.pages).toEqual([page([2], null)]);
  });

  it("passes cancellation to in-flight requests", async () => {
    let requestSignal: AbortSignal | undefined;
    read.mockImplementation(({ signal } = {}) => new Promise((_, reject) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    await render();
    let pending!: Promise<unknown>;
    await act(async () => { pending = current.refetch(); });
    expect(requestSignal?.aborted).toBe(false);
    await runQuery(async () => {
      await client.cancelQueries({ queryKey: ["github", "repositories"] });
      await pending;
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it("rebuilds continuations from fresh pages during a refetch", async () => {
    read.mockResolvedValueOnce(page([1], "old-position"))
      .mockResolvedValueOnce(page([2], null))
      .mockResolvedValueOnce(page([3], "new-position"))
      .mockResolvedValueOnce(page([4], null));
    await render();
    await runQuery(() => current.refetch());
    await runQuery(() => current.fetchNextPage());
    await runQuery(() => current.refetch());
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "old-position", null, "new-position"]);
    expect(current.data?.pages).toEqual([page([3], "new-position"), page([4], null)]);
  });
});
