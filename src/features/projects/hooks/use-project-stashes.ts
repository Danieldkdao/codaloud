import { isValidIds } from "@/lib/utils";
import type {
  GitStashPushedSchema,
  GitStashPoppedSchema,
  GitStashDroppedSchema,
} from "../server/git-stash-schemas";
import type { ProjectGitMutationContext } from "../types";
import {
  gitStashPopSchema,
  gitStashDropSchema,
  gitStashPushSchema,
  gitStashQuerySchema,
  type GitStashQuerySchema,
} from "../server/git-stash-schemas";
import {
  popProjectStashAction,
  deleteProjectStashAction,
  stashProjectChangesAction,
  readProjectStashesAction,
} from "../actions/git-actions";
import { refreshProjectGitQueries } from "../lib/git-cache";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import type { z } from "zod";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  ProjectGitError,
  ProjectGitRequestError,
  requireProjectGitSession,
} from "../lib/git-errors";

export const useProjectStashes = (
  projectId: string | null | undefined,
  {
    enabled = true,
    maxPages = 0,
    stashIndex,
    stashSha,
    ...filters
  }: Partial<Pick<GitStashQuerySchema, "search" | "pageSize">> & {
    enabled?: boolean;
    maxPages?: number;
    stashIndex?: number;
    stashSha?: string;
  } = {},
) => {
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  const validProject = !!projectId && isValidIds(projectId);
  const params = gitStashQuerySchema.safeParse({
    ...filters,
    search:
      typeof filters.search === "string"
        ? filters.search.trim().toLowerCase()
        : filters.search,
  });
  const validPageLimit = Number.isSafeInteger(maxPages) && maxPages >= 0;
  const queryKey = [
    "projects",
    "stashes",
    "infinite",
    userId,
    projectId,
    params.success ? params.data : filters,
  ] as const;
  const query = useInfiniteQuery({
    queryKey,
    enabled:
      enabled &&
      Boolean(userId) &&
      validProject &&
      params.success &&
      validPageLimit,
    initialPageParam: undefined as string | undefined,
    maxPages: validPageLimit ? maxPages : 0,
    retry: (failureCount, error) =>
      error instanceof ProjectGitRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 && (error.status === 0 || error.status >= 500))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectGitRequestError
        ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
        : 0,
    queryFn: async ({ pageParam, signal }) => {
      const id = requireProjectGitSession(userId, projectId);
      if (!params.success || !validPageLimit)
        throw new Error("Invalid stash search or pagination.");
      let failure: ProjectGitRequestError | undefined;
      const page = await readProjectStashesAction(
        id,
        { ...params.data, cursor: pageParam },
        signal,
        (status, retryAfter, code) => {
          failure = new ProjectGitRequestError(status, retryAfter, code);
        },
      );
      if (page === null)
        throw failure ?? new Error("Unable to load stashes. Please try again.");
      if (
        page.stashes.length > params.data.pageSize ||
        (page.nextCursor !== null && page.nextCursor === pageParam)
      )
        throw new Error("Invalid stash pagination response.");
      return page;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const selection = gitStashQuerySchema.safeParse({
    index: stashIndex,
    stashSha,
  });
  const stashDetails = useQuery({
    queryKey: [
      "projects",
      "stash-details",
      userId,
      projectId,
      stashIndex,
      stashSha,
    ],
    enabled:
      enabled &&
      Boolean(userId) &&
      validProject &&
      selection.success &&
      selection.data.index !== undefined,
    retry: (failureCount, error) =>
      error instanceof ProjectGitRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 && (error.status === 0 || error.status >= 500))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectGitRequestError
        ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
        : 0,
    queryFn: async ({ signal }) => {
      const id = requireProjectGitSession(userId, projectId);
      if (!selection.success || selection.data.index === undefined)
        throw new Error("Select a valid stash index and SHA.");
      let failure: ProjectGitRequestError | undefined;
      const details = await readProjectStashesAction(
        id,
        selection.data,
        signal,
        (status, retryAfter, code) => {
          failure = new ProjectGitRequestError(status, retryAfter, code);
        },
      );
      if (details === null)
        throw (
          failure ??
          new Error("Unable to load stash details. Please try again.")
        );
      return details;
    },
  });

  const loadMore = () => {
    if (
      enabled &&
      userId &&
      validProject &&
      params.success &&
      validPageLimit &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.error &&
      query.fetchStatus !== "paused"
    )
      return query.fetchNextPage({ cancelRefetch: false });
  };
  const retry = () => {
    if (
      !enabled ||
      !userId ||
      !validProject ||
      !params.success ||
      !validPageLimit ||
      query.isFetching ||
      query.fetchStatus === "paused"
    )
      return;
    if (
      query.error instanceof ProjectGitRequestError &&
      (query.error.code === "INVALID_STASH_CURSOR" ||
        query.error.code === "GIT_STASH_CHANGED")
    )
      return queryClient.resetQueries({ queryKey, exact: true });
    return query.isFetchNextPageError
      ? query.fetchNextPage({ cancelRefetch: false })
      : query.refetch();
  };

  const gitStash = useMutation<
    GitStashPushedSchema,
    ProjectGitError,
    z.input<typeof gitStashPushSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "stash", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: z.input<typeof gitStashPushSchema> = {}) => {
      const id = requireProjectGitSession(userId, projectId);
      const result = await stashProjectChangesAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  const gitPopStash = useMutation<
    GitStashPoppedSchema,
    ProjectGitError,
    z.input<typeof gitStashPopSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "popStash", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: z.input<typeof gitStashPopSchema>) => {
      const id = requireProjectGitSession(userId, projectId);
      const result = await popProjectStashAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  const gitDeleteStash = useMutation<
    GitStashDroppedSchema,
    ProjectGitError,
    z.input<typeof gitStashDropSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "deleteStash", userId, projectId],
    retry: false,
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input) => {
      const id = requireProjectGitSession(userId, projectId);
      const result = await deleteProjectStashAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Deleting shifts stash indexes and invalidates every saved pagination cursor.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  return { ...query, loadMore, retry, stashDetails, gitStash, gitPopStash, gitDeleteStash };
};
