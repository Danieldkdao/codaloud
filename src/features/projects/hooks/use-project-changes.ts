import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readProjectChangesAction } from "../actions/git-actions";

export const useProjectChanges = (
  projectId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  const project = z.uuid().safeParse(projectId);

  const query = useQuery({
    queryKey: ["projects", "changes", userId, projectId],
    enabled: enabled && Boolean(userId) && project.success,
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
      if (!userId) throw new Error("Sign in to view project changes.");
      if (!project.success) throw new Error("Invalid project ID.");

      const changes = await readProjectChangesAction(project.data, signal);
      if (changes === null) {
        throw new Error("Unable to load project changes. Please try again.");
      }
      return changes;
    },
  });
  const { refetch } = query;
  const refreshAfterSaves = useCallback(async (flushPendingSaves: () => Promise<void>, signal?: AbortSignal) => {
    if (signal?.aborted) return;
    await flushPendingSaves();
    if (signal?.aborted) return;
    // Explicit cancellation also replaces an initial read without cached data;
    // refetch alone can reuse that request and return a pre-save snapshot.
    await queryClient.cancelQueries({ queryKey: ["projects", "changes", userId, projectId], exact: true });
    if (signal?.aborted) return;
    return refetch({ throwOnError: true });
  }, [projectId, queryClient, refetch, userId]);

  return { ...query, refreshAfterSaves };
};
