import { use } from "react";
import { View } from "react-native";

import { ProjectCommitList } from "@/features/projects/components/project-commit-list";
import { demoBranches } from "@/features/projects/data/demo-commits";
import { ProjectWorkspaceBranchContext } from "@/features/projects/contexts/project-workspace-context";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const GitScreen = () => {
  const isLoading = useWorkspaceLoadingPreview();
  const selectedBranch =
    use(ProjectWorkspaceBranchContext)?.branch ?? demoBranches[0];

  if (isLoading) {
    return (
      <ProjectWorkspaceState
        isLoading
        icon="git-commit"
        title="Loading commits…"
        description="Getting your branch history ready."
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ProjectCommitList
        key={selectedBranch?.name}
        commits={selectedBranch?.commits ?? []}
      />
    </View>
  );
};

export default GitScreen;
