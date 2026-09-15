import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { ProjectWorkspaceDiff } from "@/features/projects/components/project-workspace-diff";
import { useProjectChanges } from "@/features/projects/hooks/use-project-changes";
import { createProjectWorkspaceDiff } from "@/features/projects/lib/workspace-diff";
import { useProjectFileSaveRegistry } from "@/features/projects/hooks/use-project-file-save";

export const ProjectWorkspaceChangesDiff = ({
  projectId,
}: {
  projectId: string;
}) => {
  // Entry and refresh explicitly read after the save barrier, even with a
  // previously cached snapshot. Do not start an automatic pre-save read here.
  const query = useProjectChanges(projectId, { enabled: false });
  const { refreshAfterSaves } = query;
  const { flushPendingSaves } = useProjectFileSaveRegistry();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<Error | null>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshAfterSaves(flushPendingSaves, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        setRefreshError(
          error instanceof Error
            ? error
            : new Error("Unable to refresh changes."),
        );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
      if (request.current === controller) request.current = null;
    }
  }, [flushPendingSaves, refreshAfterSaves]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        request.current?.abort();
      };
    }, [refresh]),
  );
  const data = useMemo(
    () => (query.data ? createProjectWorkspaceDiff(query.data) : undefined),
    [query.data],
  );

  return (
    <ProjectWorkspaceDiff
      key={projectId}
      data={data}
      isFetching={refreshing || query.isFetching}
      isPaused={query.fetchStatus === "paused"}
      error={refreshError ?? query.error}
      onRefresh={() => {
        void refresh();
      }}
    />
  );
};
