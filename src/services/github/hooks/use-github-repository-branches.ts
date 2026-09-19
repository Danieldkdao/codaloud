import { useInfiniteQuery } from "@tanstack/react-query";

import { useGitHubProfile } from "./use-github-profile";
import { PAGE_SIZE } from "@/lib/constants";
import { readGitHubRepositoryBranches } from "../actions/actions";
import { gitHubRepositoryBranchesRequestSchema } from "../schemas";
import type { GitHubRepositoryPagination } from "../types";

export const useGitHubRepositoryBranches = (
  repositoryId: string | null | undefined,
  {
    pageSize = PAGE_SIZE,
    search = "",
    enabled = true,
  }: Pick<GitHubRepositoryPagination, "pageSize" | "search"> & {
    enabled?: boolean;
  } = {},
) => {
  const connection = useGitHubProfile();
  const userId =
    connection.ready && connection.scopes.includes("repo")
      ? (connection.profile?.id ?? null)
      : null;
  const normalizedSearch = search.trim().toLowerCase();
  const validatedId =
    gitHubRepositoryBranchesRequestSchema.shape.repositoryId.safeParse(
      repositoryId,
    );

  const query = useInfiniteQuery({
    queryKey: [
      "github",
      "repositories",
      repositoryId,
      "branches",
      "infinite",
      "cursor",
      userId,
      { pageSize, search: normalizedSearch },
    ],
    queryFn: async ({ pageParam, signal }) => {
      // Manual refetch can run even when the query is disabled.
      if (!userId) throw new Error("Connect GitHub to view branches.");
      if (!validatedId.success)
        throw new Error("Select a valid GitHub repository.");

      const branches = await readGitHubRepositoryBranches(validatedId.data, {
        cursor: pageParam,
        pageSize,
        search: normalizedSearch,
        signal,
      });
      // Read actions return null on failure; queries must reject to expose an error.
      if (branches === null)
        throw new Error(
          "Unable to load GitHub repository branches. Please try again.",
        );

      return branches;
    },
    initialPageParam: null as string | null,
    // Sparse searches can return an empty page with more branches to scan.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    networkMode: "online",
    enabled: enabled && Boolean(userId) && validatedId.success,
  });

  const loadMore = () => {
    if (
      enabled &&
      userId &&
      validatedId.success &&
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
      !userId ||
      !validatedId.success ||
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
