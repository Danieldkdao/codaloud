import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGitHubRepositories } from "@/services/github/hooks/use-github-repositories";
import { useGitHubRepositoryBranches } from "@/services/github/hooks/use-github-repository-branches";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: () => mocks.query }));
vi.mock("../hooks/use-github-profile", () => ({ useGitHubProfile: () => ({ profile: { id: 1 }, ready: true, scopes: ["repo"] }) }));
vi.mock("@/services/github/actions/actions", () => ({ readGitHubRepositories: vi.fn(), readGitHubRepositoryBranches: vi.fn() }));

beforeEach(() => {
  mocks.query = {
    hasNextPage: true, isFetching: false, error: null,
    fetchStatus: "idle", isFetchNextPageError: false,
    fetchNextPage: mocks.fetchNextPage, refetch: mocks.refetch,
  };
});

describe.each([
  { name: "repositories", useQuery: () => useGitHubRepositories() },
  { name: "branches", useQuery: () => useGitHubRepositoryBranches("123") },
])("$name pagination controls", ({ useQuery }) => {
  it("loads the next page without cancelling an existing fetch", () => {
    useQuery().loadMore();
    expect(mocks.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it.each([
    { hasNextPage: false }, { isFetching: true },
    { error: new Error("Failed") }, { fetchStatus: "paused" },
  ])("does not load more when blocked by %j", (state) => {
    Object.assign(mocks.query, state);
    useQuery().loadMore();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  it("retries a failed continuation instead of restarting the list", () => {
    Object.assign(mocks.query, { isFetchNextPageError: true, error: new Error("Failed") });
    useQuery().retry();
    expect(mocks.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("refetches on an initial or refresh failure", () => {
    Object.assign(mocks.query, { error: new Error("Failed") });
    useQuery().retry();
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  it.each([false, true])("ignores retry during a fetch, next-page error=%s", (isFetchNextPageError) => {
    Object.assign(mocks.query, { isFetching: true, isFetchNextPageError });
    useQuery().retry();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });
});
