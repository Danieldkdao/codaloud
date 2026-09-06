import { readGitHubRepositories } from "@/services/github/actions/actions";
import type { GitHubRepositoryPagination } from "@/features/projects/types";
import { DEFAULT_PAGE, PAGE_SIZE } from "@/lib/constants";
import { useInfiniteQuery } from "@tanstack/react-query";

export const useGitHubRepositories = ({
  pageSize = PAGE_SIZE,
  search = "",
  enabled = true,
}: Pick<GitHubRepositoryPagination, "pageSize" | "search"> & {
  enabled?: boolean;
} = {}) => {
  const normalizedSearch = search.trim().toLowerCase();

  return useInfiniteQuery({
    queryKey: [
      "github",
      "repositories",
      "infinite",
      { pageSize, search: normalizedSearch },
    ],
    queryFn: ({ pageParam, signal }) =>
      readGitHubRepositories({
        page: pageParam,
        pageSize,
        search: normalizedSearch,
        signal,
      }),
    initialPageParam: DEFAULT_PAGE,
    // The API returns arrays only; a short or empty page marks the end.
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === pageSize ? lastPageParam + 1 : undefined,
    enabled,
  });
};
