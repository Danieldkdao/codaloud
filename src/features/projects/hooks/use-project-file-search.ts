import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readProjectFilesAction } from "../actions/file-actions";
import {
  projectFileSearchQuerySchema,
  type ProjectFileSearchQuerySchema,
} from "../actions/file-search-schemas";
import { projectFileSearchLimits } from "../constants";
import { formatProjectFileSearchError } from "../lib/formatters";
import { useProjectFileSaveRegistry } from "./use-project-file-save";

class ProjectFileSearchRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number,
    readonly code: string | undefined,
    readonly isContinuation: boolean,
  ) {
    super(formatProjectFileSearchError(code));
    this.name = "ProjectFileSearchRequestError";
  }
}

export const useProjectFileSearch = (
  projectId: string | null | undefined,
  {
    search = "",
    scope = "all",
    path = "",
    pageSize = projectFileSearchLimits.pageSize,
    enabled = true,
  }: Partial<Omit<ProjectFileSearchQuerySchema, "cursor">> & {
    enabled?: boolean;
  } = {},
) => {
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  const queryClient = useQueryClient();
  const { flushPendingSaves } = useProjectFileSaveRegistry();
  // Preserve meaningful spaces in literal content searches; blank searches are invalid.
  const params = projectFileSearchQuerySchema.safeParse({
    search,
    scope,
    path,
    pageSize,
  });
  const validProject = z.uuid().safeParse(projectId);
  const validationError = params.success
    ? null
    : (params.error.issues[0]?.message ?? "Invalid project file search or pagination.");
  const canSearch =
    enabled && Boolean(userId) && validProject.success && params.success;
  const queryKey = useMemo(
    () => [
      "projects",
      "file-search",
      "infinite",
      userId,
      projectId,
      { search, scope, path, pageSize },
    ],
    [userId, projectId, search, scope, path, pageSize],
  );

  const query = useInfiniteQuery({
    queryKey,
    enabled: canSearch,
    initialPageParam: null as string | null,
    // Keep pages while observed, but start fresh when returning to an old search.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, error) =>
      error instanceof ProjectFileSearchRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 &&
          (error.status === 0 || error.status === 429 || error.status >= 500))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectFileSearchRequestError
        ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
        : 0,
    queryFn: async ({ pageParam, signal }) => {
      // Manual refetch bypasses enabled, so validate again before sending a request.
      if (!userId) throw new Error("Sign in to search project files.");
      if (!validProject.success) {
        throw new Error("Invalid project file search or pagination.");
      }
      if (!params.success) throw new Error(validationError!);
      // A new snapshot must include pending editor writes. Continuations keep
      // their existing snapshot and use the server's workspace-change recovery.
      if (pageParam === null) await flushPendingSaves();
      // Canceling search must not cancel accepted saves, but it must prevent
      // an obsolete request from starting once those saves settle.
      if (signal.aborted) throw new Error("Search canceled.");
      let requestError: ProjectFileSearchRequestError | undefined;
      const result = await readProjectFilesAction(
        validProject.data,
        { ...params.data, cursor: pageParam ?? undefined },
        signal,
        undefined,
        (status, retryAfter, code) => {
          const seconds = Number(retryAfter);
          const delay =
            Number.isFinite(seconds) && seconds > 0
              ? Math.min(Math.max(seconds * 1000, 1000), 30_000)
              : code === "WORKSPACE_RESTORING"
                ? 3000
                : 0;
          requestError = new ProjectFileSearchRequestError(
            status,
            delay,
            code,
            pageParam !== null,
          );
        },
      );
      if (result === null) {
        throw (
          requestError ??
          new Error(formatProjectFileSearchError(undefined))
        );
      }
      return result;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  useEffect(() => {
    const error = query.error;
    if (
      !canSearch ||
      !(error instanceof ProjectFileSearchRequestError) ||
      !error.isContinuation
    )
      return;
    if (
      (error.status === 410 && error.code === "SEARCH_SESSION_EXPIRED") ||
      (error.status === 409 && error.code === "SEARCH_WORKSPACE_CHANGED") ||
      (error.status === 400 && error.code === "INVALID_SEARCH_CURSOR")
    ) {
      // Replace the entire snapshot: appending a fresh first page would mix sessions.
      // A failed first page never enters this branch, so recovery cannot loop.
      void queryClient.resetQueries({ queryKey, exact: true });
    }
  }, [canSearch, query.error, queryClient, queryKey]);

  // Disabled queries can stay pending without making a request. Keep input
  // validation separate so the screen can show feedback instead of a spinner.
  return { ...query, validationError: enabled ? validationError : null };
};
