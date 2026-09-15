import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  checkoutProjectBranchAction,
  readProjectBranchesAction,
} from "../actions/git-actions";
import type {
  CheckoutProjectBranchSchema,
  ProjectBranchCheckoutSchema,
} from "../actions/branch-schemas";
import {
  projectBranchParamsSchema,
  type ProjectBranchParamsSchema,
} from "../lib/branch-params";
import { useAuthSession } from "@/hooks/use-auth-session";

class ProjectBranchRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number,
    readonly code?: string,
  ) {
    super("Unable to load project branches. Please try again.");
    this.name = "ProjectBranchRequestError";
  }
}

class ProjectBranchCheckoutError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ProjectBranchCheckoutError";
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
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  const params = projectBranchParamsSchema.safeParse({
    ...filters,
    projectId,
    cursor: filters.cursor ?? null,
  });
  const validPageLimit = Number.isSafeInteger(maxPages) && maxPages >= 0;

  const query = useInfiniteQuery({
    queryKey: [
      "projects",
      "branches",
      "infinite",
      "cursor",
      userId,
      projectId,
      "local",
      params.success ? params.data : filters,
    ],
    enabled: enabled && Boolean(userId) && params.success && validPageLimit,
    initialPageParam: (params.success ? (params.data.cursor ?? null) : null) as
      string | null,
    maxPages: validPageLimit ? maxPages : 0,
    // A remount can refresh cached branches while Daytona is waking up. Retry
    // restoration while observed, and give transient network/server failures two retries.
    retry: (failureCount, error) =>
      error instanceof ProjectBranchRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 && (error.status === 0 || error.status >= 500))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectBranchRequestError
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
          const delay =
            Number.isFinite(seconds) && seconds > 0
              ? Math.min(Math.max(seconds * 1000, 1000), 30_000)
              : code === "WORKSPACE_RESTORING"
                ? 3000
                : 0;
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

  const checkout = useMutation<
    ProjectBranchCheckoutSchema,
    ProjectBranchCheckoutError,
    CheckoutProjectBranchSchema,
    { userId: string | null; projectId: string | null | undefined }
  >({
    mutationKey: ["projects", "branches", "checkout", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input) => {
      if (!userId)
        throw new ProjectBranchCheckoutError("Sign in to switch branches.");
      if (!projectId)
        throw new ProjectBranchCheckoutError("Invalid project ID.");
      // The action validates input and confirms the response matches the requested branch.
      const result = await checkoutProjectBranchAction(projectId, input);
      if (result.error)
        throw new ProjectBranchCheckoutError(result.message, result.code);
      return result.data;
    },
    onSettled: async (_data, error, _input, context) => {
      if (!context || (error && error.code !== "CHECKOUT_OUTCOME_UNKNOWN")) return;
      // Refresh the submitted workspace even if the hook has since navigated.
      const changesQuery = {
        queryKey: ["projects", "changes", context.userId, context.projectId],
        exact: true,
      };
      // An initial read without cached data must not finish with the old branch's snapshot.
      await queryClient.cancelQueries(changesQuery);
      await queryClient.invalidateQueries(changesQuery);
    },
  });

  const recoverCheckout = async (): Promise<ProjectBranchCheckoutSchema> => {
    if (!userId || !projectId) throw new Error("Sign in to confirm the current branch.");
    // Capture this hook's workspace, rather than refetching an observer that may
    // have moved to another project while the checkout response was in flight.
    const branches = await readProjectBranchesAction(projectId, { search: "", pageSize: 1, cursor: null });
    if (!branches?.currentBranch) throw new Error("Unable to confirm the current branch. Reconnect and retry recovery.");
    return { previousBranch: null, currentBranch: branches.currentBranch };
  };

  const loadMore = () => {
    if (
      enabled &&
      userId &&
      params.success &&
      validPageLimit &&
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
      !params.success ||
      !validPageLimit ||
      query.isFetching ||
      query.fetchStatus === "paused"
    )
      return;
    return query.isFetchNextPageError
      ? query.fetchNextPage({ cancelRefetch: false })
      : query.refetch();
  };

  return { ...query, loadMore, retry, checkout, recoverCheckout };
};
