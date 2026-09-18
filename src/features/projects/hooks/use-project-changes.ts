import { isValidIds } from "@/lib/utils";
import type { GitDiscardedSchema } from "../server/git-discard-schemas";
import type { ProjectGitMutationContext } from "../types";
import { gitDiscardSchema } from "../server/git-discard-schemas";
import { refreshProjectGitQueries } from "../lib/git-cache";
import {
  discardProjectChangesAction,
  readProjectDiscardPreviewAction,
  readProjectChangesAction,
} from "../actions/git-actions";
import {
  ProjectGitError,
  ProjectGitRequestError,
  requireLocalGitProject,
} from "../lib/git-errors";
import { useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
export const useProjectChanges = (
  projectId: string | null | undefined,
  {
    enabled = true,
    discardPreviewEnabled = false,
  }: { enabled?: boolean; discardPreviewEnabled?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  const validProject = !!projectId && isValidIds(projectId);

  const query = useQuery({
    networkMode: "always",
    queryKey: ["projects", "changes", projectId],
    enabled: enabled && validProject,
    // Keep snapshots until a manual refresh or an explicit invalidation after
    // a workspace write. Stale snapshots reload when this panel becomes active.
    staleTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retryOnMount: false,
    // The action loses HTTP status; surface failures for an explicit retry.
    retry: false,
    queryFn: async ({ signal }) => {
      // Manual refetch bypasses enabled, so guard the request here too.
      if (!projectId || !validProject) throw new Error("Invalid project ID.");

      const changes = await readProjectChangesAction(projectId, signal);
      if (changes === null) {
        throw new Error("Unable to load project changes. Please try again.");
      }
      return changes;
    },
  });
  const discardPreview = useQuery({
    networkMode: "always",
    queryKey: ["projects", "discard-preview", projectId],
    enabled:
      enabled && discardPreviewEnabled && validProject,
    staleTime: 0,
    retry: (failureCount, error) =>
      error instanceof ProjectGitRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 && (error.status === 0 || error.status >= 500))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectGitRequestError
        ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
        : 0,
    queryFn: async ({ signal }) => {
      const id = requireLocalGitProject(projectId);
      let failure: ProjectGitRequestError | undefined;
      const preview = await readProjectDiscardPreviewAction(
        id,
        signal,
        (status, retryAfter, code) => {
          failure = new ProjectGitRequestError(status, retryAfter, code);
        },
      );
      if (preview === null)
        throw (
          failure ?? new Error("Unable to prepare discard. Please try again.")
        );
      return preview;
    },
  });

  const { refetch } = query;
  const refreshAfterSaves = useCallback(
    async (flushPendingSaves: () => Promise<void>, signal?: AbortSignal) => {
      if (signal?.aborted) return;
      await flushPendingSaves();
      if (signal?.aborted) return;
      // Explicit cancellation also replaces an initial read without cached data;
      // refetch alone can reuse that request and return a pre-save snapshot.
      await queryClient.cancelQueries({
        queryKey: ["projects", "changes", projectId],
        exact: true,
      });
      if (signal?.aborted) return;
      return refetch({ throwOnError: true });
    },
    [projectId, queryClient, refetch],
  );

  const gitDiscardChanges = useMutation<
    GitDiscardedSchema,
    ProjectGitError,
    z.input<typeof gitDiscardSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "discardChanges", projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ projectId }),
    mutationFn: async (input: z.input<typeof gitDiscardSchema>) => {
      const id = requireLocalGitProject(projectId);
      const result = await discardProjectChangesAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes in the repository.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context),
  });

  return { gitDiscardChanges, ...query, refreshAfterSaves, discardPreview };
};
