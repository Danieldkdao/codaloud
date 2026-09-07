import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { gitHubRepositoriesQueryOptions } from "@/services/github/queries/repositories";
import { readGitHubRepositories } from "@/services/github/actions/actions";
import type { GitHubRepositoryPage } from "@/services/github/types";

vi.mock("@/services/github/actions/actions", () => ({ readGitHubRepositories: vi.fn() }));
const read = vi.mocked(readGitHubRepositories);
let client: QueryClient;
const subscriptions: (() => void)[] = [];
const page = (ids: number[], nextCursor: string | null): GitHubRepositoryPage => ({
  repositories: ids.map((id) => ({
    id, name: `repo-${id}`, fullName: `owner/repo-${id}`, description: null,
    private: true, archived: false, defaultBranch: "main", cloneUrl: "", htmlUrl: "",
    permissions: { pull: true, push: false, admin: false },
  })),
  nextCursor,
});
const observe = (search = "match") => {
  const observer = new InfiniteQueryObserver(client, gitHubRepositoriesQueryOptions({ search, pageSize: 2, enabled: false }));
  subscriptions.push(observer.subscribe(() => {}));
  return observer;
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  read.mockReset();
});
afterEach(() => {
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  client.clear();
});

describe("repository infinite queries", () => {
  it("uses server cursors through empty, partial, and full final pages", async () => {
    read.mockResolvedValueOnce(page([], "sixth"))
      .mockResolvedValueOnce(page([1], "seventh"))
      .mockResolvedValueOnce(page([2, 3], null));
    const observer = observe();
    await observer.refetch();
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    await observer.fetchNextPage();
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "sixth", "seventh"]);
    expect(observer.getCurrentResult().data?.pages.flatMap((p) => p.repositories.map((r) => r.id))).toEqual([1, 2, 3]);
  });

  it("retries a failed continuation without discarding loaded results", async () => {
    read.mockResolvedValueOnce(page([1], "retry-here"))
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce(page([2], null));
    const observer = observe();
    await observer.refetch();
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().isFetchNextPageError).toBe(true);
    expect(observer.getCurrentResult().data?.pages).toEqual([page([1], "retry-here")]);
    await observer.fetchNextPage();
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "retry-here", "retry-here"]);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(2);
  });

  it("normalizes search keys and starts a different search from its own first page", async () => {
    expect(gitHubRepositoriesQueryOptions({ search: " MATCH " }).queryKey)
      .toEqual(gitHubRepositoriesQueryOptions({ search: "match" }).queryKey);
    read.mockResolvedValueOnce(page([1], "first-search"))
      .mockResolvedValueOnce(page([2], null));
    const observer = observe(" MATCH ");
    await observer.refetch();
    observer.setOptions(gitHubRepositoriesQueryOptions({ search: "different", pageSize: 2, enabled: false }));
    await observer.refetch();
    expect(read.mock.calls.map(([options]) => [options?.search, options?.cursor])).toEqual([["match", null], ["different", null]]);
    expect(observer.getCurrentResult().data?.pages).toEqual([page([2], null)]);
  });

  it("passes cancellation to in-flight requests", async () => {
    let requestSignal: AbortSignal | undefined;
    read.mockImplementation(({ signal } = {}) => new Promise((_, reject) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const observer = observe();
    const pending = observer.refetch();
    expect(requestSignal?.aborted).toBe(false);
    await client.cancelQueries({ queryKey: ["github", "repositories"] });
    await pending;
    expect(requestSignal?.aborted).toBe(true);
  });

  it("rebuilds continuations from fresh pages during a refetch", async () => {
    read.mockResolvedValueOnce(page([1], "old-position"))
      .mockResolvedValueOnce(page([2], null))
      .mockResolvedValueOnce(page([3], "new-position"))
      .mockResolvedValueOnce(page([4], null));
    const observer = observe();
    await observer.refetch();
    await observer.fetchNextPage();
    await observer.refetch();
    expect(read.mock.calls.map(([options]) => options?.cursor)).toEqual([null, "old-position", null, "new-position"]);
    expect(observer.getCurrentResult().data?.pages).toEqual([page([3], "new-position"), page([4], null)]);
  });
});
