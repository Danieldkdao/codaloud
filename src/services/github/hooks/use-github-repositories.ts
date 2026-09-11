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
  const normalizedSearch = search.trim().toLowerCase();
  return useInfiniteQuery({
    // Separate the new page shape from older array-based cache entries.
    queryKey: [
      "github", "repositories", "infinite", "cursor",
      { pageSize, search: normalizedSearch },
    ],
    queryFn: ({ pageParam, signal }) =>
      readGitHubRepositories({
        cursor: pageParam,
        pageSize,
        search: normalizedSearch,
        signal,
      }),
    initialPageParam: null as string | null,
    // Sparse searches may return a partial or empty batch with more to scan.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
};
