import { isValidIds } from "@/lib/utils";
import type {
  GitCreatedBranchSchema,
  GitDeletedBranchSchema,
  GitDeleteBranchSchema,
} from "../server/git-branch-schemas";
import type { ProjectGitMutationContext } from "../types";
import { gitCreateBranchSchema } from "../server/git-branch-schemas";
import type { z } from "zod";
import { ProjectGitError, requireLocalGitProject } from "../lib/git-errors";
import { refreshProjectGitQueries } from "../lib/git-cache";
import {
  createProjectBranchAction,
  deleteProjectBranchAction,
  checkoutProjectBranchAction,
  readProjectBranchesAction,
} from "../actions/git-actions";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  projectBranchParamsSchema,
  type ProjectBranchParamsSchema,
} from "../lib/branch-params";
import type {
  CheckoutProjectBranchSchema,
  ProjectBranchCheckoutSchema,
} from "../actions/branch-schemas";

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
  const params = projectBranchParamsSchema.safeParse({
    ...filters,
    projectId,
    cursor: filters.cursor ?? null,
  });
  const validPageLimit = Number.isSafeInteger(maxPages) && maxPages >= 0;

  const query = useInfiniteQuery({
    networkMode: "always",
    queryKey: [
      "projects",
      "branches",
      "infinite",
      "cursor",
      projectId,
      "local",
      params.success ? params.data : filters,
    ],
    enabled: enabled && params.success && validPageLimit,
    initialPageParam: (params.success ? (params.data.cursor ?? null) : null) as
      string | null,
    maxPages: validPageLimit ? maxPages : 0,
    // Retry transient storage failures while this view is observed.
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

  const gitCheckout = useMutation<
    ProjectBranchCheckoutSchema,
    ProjectBranchCheckoutError,
    CheckoutProjectBranchSchema,
    { projectId: string | null | undefined }
  >({
    mutationKey: ["projects", "branches", "checkout", projectId],
    retry: false,
    networkMode: "always",
    onMutate: () => ({ projectId }),
    mutationFn: async (input) => {
      if (!projectId || !isValidIds(projectId))
        throw new ProjectBranchCheckoutError("Invalid project ID.");
      // The action validates input and confirms the response matches the requested branch.
      const result = await checkoutProjectBranchAction(projectId, input);
      if (result.error)
        throw new ProjectBranchCheckoutError(result.message, result.code);
      return result.data;
    },
    onSettled: async (_data, error, _input, context) => {
      if (!context || (error && error.code !== "CHECKOUT_OUTCOME_UNKNOWN"))
        return;
      await refreshProjectGitQueries(queryClient, context);
    },
  });

  const recoverCheckout = async (): Promise<ProjectBranchCheckoutSchema> => {
    if (!projectId) throw new Error("The local workspace is not ready.");
    // Capture this hook's workspace, rather than refetching an observer that may
    // have moved to another project while the checkout response was in flight.
    const branches = await readProjectBranchesAction(projectId, {
      search: "",
      pageSize: 1,
      cursor: null,
    });
    if (!branches?.currentBranch)
      throw new Error(
        "Unable to confirm the current branch. Reconnect and retry recovery.",
      );
    return { previousBranch: null, currentBranch: branches.currentBranch };
  };

  const loadMore = () => {
    if (
      enabled &&
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

  const gitCreateBranch = useMutation<
    GitCreatedBranchSchema,
    ProjectGitError,
    z.input<typeof gitCreateBranchSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "createBranch", projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ projectId }),
    mutationFn: async (input: z.input<typeof gitCreateBranchSchema>) => {
      const id = requireLocalGitProject(projectId);
      const result = await createProjectBranchAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes in the repository.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  const gitDeleteBranch = useMutation<
    GitDeletedBranchSchema,
    ProjectGitError,
    GitDeleteBranchSchema,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "deleteBranch", projectId],
    retry: false,
    networkMode: "always",
    onMutate: () => ({ projectId }),
    mutationFn: async (input) => {
      const result = await deleteProjectBranchAction(
        requireLocalGitProject(projectId),
        input,
      );
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  return {
    gitDeleteBranch,
    gitCreateBranch,
    ...query,
    loadMore,
    retry,
    gitCheckout,
    recoverCheckout,
  };
};
