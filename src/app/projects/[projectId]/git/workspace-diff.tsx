import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";

import { ProjectWorkspaceDiff } from "@/features/projects/components/project-workspace-diff";
import { useProjectChanges } from "@/features/projects/hooks/use-project-changes";
import { createProjectWorkspaceDiff } from "@/features/projects/lib/workspace-diff";

const WorkspaceDiffScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const query = useProjectChanges(projectId);
  const data = useMemo(() => query.data ? createProjectWorkspaceDiff(query.data) : undefined, [query.data]);

  return (
    <ProjectWorkspaceDiff
      key={projectId}
      data={data}
      isFetching={query.isFetching}
      isPaused={query.fetchStatus === "paused"}
      error={query.error}
      onRefresh={() => { void query.refetch(); }}
    />
  );
};

export default WorkspaceDiffScreen;
