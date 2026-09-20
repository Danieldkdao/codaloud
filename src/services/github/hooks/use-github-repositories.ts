import { useGitHubProfile } from "./use-github-profile";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PAGE_SIZE } from "@/lib/constants";
import { readGitHubRepositories } from "../actions/actions";
import type { GitHubRepositoryPagination } from "../types";

export const useGitHubRepositories = ({
  pageSize = PAGE_SIZE,
  search = "",
  enabled = true,
}: Pick<GitHubRepositoryPagination, "pageSize" | "search"> & {
  enabled?: boolean;
} = {}) => {
  const connection = useGitHubProfile();
  const profileId = connection.profile?.id ?? null;
  const canRead =
    connection.ready &&
    profileId !== null &&
    connection.scopes.includes("repo");
  const normalizedSearch = search.trim().toLowerCase();
  const query = useInfiniteQuery({
    // Separate the new page shape from older array-based cache entries.
    queryKey: [
      "github",
      "repositories",
      "infinite",
      "cursor",
      profileId,
      { pageSize, search: normalizedSearch },
    ],
    queryFn: async ({ pageParam, signal }) => {
      if (!canRead)
        throw new Error("Connect GitHub to view your repositories.");
      const repositories = await readGitHubRepositories({
        cursor: pageParam,
        pageSize,
        search: normalizedSearch,
        signal,
      });
      if (repositories === null)
        throw new Error(
          "Unable to load GitHub repositories. Check your connection and try again.",
        );
      return repositories;
    },
    initialPageParam: null as string | null,
    // Sparse searches may return a partial or empty batch with more to scan.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && canRead,
    networkMode: "online",
  });

  const loadMore = () => {
    if (
      enabled &&
      canRead &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.error &&
      query.fetchStatus !== "paused"
    ) {
      return query.fetchNextPage({ cancelRefetch: false });
    }
  };
  const retry = () => {
    if (
      !enabled ||
      !canRead ||
      query.isFetching ||
      query.fetchStatus === "paused"
    )
      return;
    return query.isFetchNextPageError
      ? query.fetchNextPage({ cancelRefetch: false })
      : query.refetch();
  };

  return { ...query, loadMore, retry };
};
