import { useLocalSearchParams } from "expo-router";

import { ProjectCommitDiff } from "@/features/projects/components/project-commit-diff";
import { ProjectWorkspaceChangesDiff } from "@/features/projects/components/project-workspace-changes-diff";
import { getProjectCommitDiffParams } from "@/features/projects/lib/commit-params";

const WorkspaceDiffScreen = () => {
  const { projectId, commitSha, source } = useLocalSearchParams<{
    projectId: string;
    commitSha?: string | string[];
    source?: string | string[];
  }>();

  const commit = getProjectCommitDiffParams(commitSha, source);
  if (commit) {
    return <ProjectCommitDiff key={`${projectId}:${commit.source}:${commit.commitSha}`} projectId={projectId} {...commit} />;
  }

  return <ProjectWorkspaceChangesDiff key={projectId} projectId={projectId} />;
};

export default WorkspaceDiffScreen;
