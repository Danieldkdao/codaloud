import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readProjectCommitsAction } from "../actions/git-actions";
import { projectCommitParamsSchema, type ProjectCommitParamsSchema } from "../lib/commit-params";

class ProjectCommitHistoryRequestError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number, readonly code?: string) {
    super("Unable to load commit history. Please try again.");
    this.name = "ProjectCommitHistoryRequestError";
  }
}

export const useProjectCommitHistory = (
  projectId: string | null | undefined,
  {
    enabled = true,
    maxPages = 0,
    ...filters
  }: Partial<Omit<ProjectCommitParamsSchema, "projectId" | "cursor">> & {
    enabled?: boolean;
    maxPages?: number;
  } = {},
) => {
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const params = projectCommitParamsSchema.safeParse({ ...filters, projectId, cursor: null });
  const validPageLimit = Number.isSafeInteger(maxPages) && maxPages >= 0;
  const queryKey = [
    "projects", "commits", "infinite", "cursor", userId, projectId,
    params.success ? params.data : filters,
  ] as const;

  const query = useInfiniteQuery({
    queryKey,
    enabled: enabled && Boolean(userId) && params.success && validPageLimit,
    initialPageParam: null as string | null,
    maxPages: validPageLimit ? maxPages : 0,
    // Restoration is expected on remount. Other transient failures get two retries.
    retry: (failureCount, error) => error instanceof ProjectCommitHistoryRequestError && (
      (error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
      (failureCount < 2 && (error.status === 0 || error.status >= 500))
    ),
    retryDelay: (attempt, error) => error instanceof ProjectCommitHistoryRequestError
      ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
      : 0,
    queryFn: async ({ pageParam, signal }) => {
      // Manual refetch bypasses enabled, so validate authentication and options here too.
      if (!userId) throw new Error("Sign in to view commit history.");
      if (!params.success || !validPageLimit) {
        throw new Error("Invalid project, branch, or commit search and pagination.");
      }
      const { projectId: validatedProjectId, ...input } = params.data;
      let requestError: ProjectCommitHistoryRequestError | undefined;
      const commits = await readProjectCommitsAction(
        validatedProjectId,
        { ...input, cursor: pageParam },
        signal,
        (status, retryAfter, code) => {
          const seconds = Number(retryAfter);
          const delay = Number.isFinite(seconds) && seconds > 0
            ? Math.min(Math.max(seconds * 1000, 1000), 30_000)
            : code === "WORKSPACE_RESTORING" ? 3000 : 0;
          requestError = new ProjectCommitHistoryRequestError(status, delay, code);
        },
      );
      if (commits === null) {
        throw requestError ?? new Error("Unable to load commit history. Please try again.");
      }
      return commits;
    },
    // An empty search page may still have unscanned history.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const onLoadMore = () => {
    if (enabled && userId && params.success && validPageLimit && query.hasNextPage &&
      !query.isFetching && !query.error && query.fetchStatus !== "paused") {
      return query.fetchNextPage({ cancelRefetch: false });
    }
  };
  const retry = () => {
    if (!enabled || !userId || !params.success || !validPageLimit || query.isFetching || query.fetchStatus === "paused") return;
    if (query.error instanceof ProjectCommitHistoryRequestError && (
      query.error.code === "INVALID_COMMIT_CURSOR" || query.error.code === "HISTORY_SNAPSHOT_UNAVAILABLE"
    )) {
      // Expired cursors cannot be retried. Reset even when maxPages evicted page one.
      return queryClient.resetQueries({ queryKey, exact: true });
    }
    return query.isFetchNextPageError
      ? query.fetchNextPage({ cancelRefetch: false })
      : query.refetch();
  };

  return { ...query, onLoadMore, retry };
};
