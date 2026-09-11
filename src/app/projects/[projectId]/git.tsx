import { View } from "react-native";

import { ProjectCommitList } from "@/features/projects/components/project-commit-list";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const GitScreen = () => {
  const isLoading = useWorkspaceLoadingPreview();
  const { branch: selectedBranch } = useProjectWorkspaceBranch();

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
