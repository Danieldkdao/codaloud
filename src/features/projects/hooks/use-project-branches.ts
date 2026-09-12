import { useInfiniteQuery } from "@tanstack/react-query";
import { readProjectBranchesAction } from "../actions/git-actions";
import {
  projectBranchParamsSchema,
  type ProjectBranchParamsSchema,
} from "../lib/branch-params";
import { useAuthSession } from "@/hooks/use-auth-session";

class ProjectBranchRequestError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number, readonly code?: string) {
    super("Unable to load project branches. Please try again.");
    this.name = "ProjectBranchRequestError";
  }
}

export const useProjectBranches = (
  projectId: string | null | undefined,
  {
    enabled = true,
    maxPages = 0,
    ...filters
  }: Partial<Omit<ProjectBranchParamsSchema, "projectId">> & {
    enabled?: boolean;
    maxPages?: number;
  } = {},
) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error
    ? session.data?.user.id ?? null
    : null;
  const params = projectBranchParamsSchema.safeParse({
    ...filters,
    projectId,
    cursor: filters.cursor ?? null,
  });
  const validPageLimit = Number.isSafeInteger(maxPages) && maxPages >= 0;

  const query = useInfiniteQuery({
    queryKey: [
      "projects", "branches", "infinite", "cursor", userId, projectId,
      params.success ? params.data : filters,
    ],
    enabled: enabled && Boolean(userId) && params.success && validPageLimit,
    initialPageParam: (params.success ? params.data.cursor ?? null : null) as string | null,
    maxPages: validPageLimit ? maxPages : 0,
    // A remount can refresh cached branches while Daytona is waking up. Retry
    // restoration while observed, and give transient network/server failures two retries.
    retry: (failureCount, error) => error instanceof ProjectBranchRequestError && (
      (error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
      (failureCount < 2 && (error.status === 0 || error.status >= 500))
    ),
    retryDelay: (attempt, error) => error instanceof ProjectBranchRequestError
      ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
      : 0,
    queryFn: async ({ pageParam, signal }) => {
      // Manual refetch can run while the query is disabled.
      if (!userId) throw new Error("Sign in to view project branches.");
      if (!params.success || !validPageLimit) {
        throw new Error("Invalid project branch search or pagination.");
      }
      const { projectId: validatedProjectId, search, pageSize } = params.data;
      let requestError: ProjectBranchRequestError | undefined;
      const branches = await readProjectBranchesAction(
        validatedProjectId,
        { search, pageSize, cursor: pageParam },
        signal,
        (status, retryAfter, code) => {
          const seconds = Number(retryAfter);
          const delay = Number.isFinite(seconds) && seconds > 0
            ? Math.min(Math.max(seconds * 1000, 1000), 30_000)
            : code === "WORKSPACE_RESTORING" ? 3000 : 0;
          requestError = new ProjectBranchRequestError(status, delay, code);
        },
      );
      if (branches === null) {
        if (requestError) throw requestError;
        throw new Error("Unable to load project branches. Please try again.");
      }
      return branches;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const loadMore = () => {
    if (enabled && userId && params.success && validPageLimit && query.hasNextPage &&
      !query.isFetching && !query.error && query.fetchStatus !== "paused") {
      return query.fetchNextPage({ cancelRefetch: false });
    }
  };
  const retry = () => {
    if (!enabled || !userId || !params.success || !validPageLimit || query.isFetching || query.fetchStatus === "paused") return;
    return query.isFetchNextPageError
      ? query.fetchNextPage({ cancelRefetch: false })
      : query.refetch();
  };

  return { ...query, loadMore, retry };
};
