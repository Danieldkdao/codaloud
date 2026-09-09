import { useState } from "react";
import { View } from "react-native";

import { ProjectBranchSelect } from "@/features/projects/components/project-branch-select";
import { ProjectCommitList } from "@/features/projects/components/project-commit-list";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";
import { demoBranches } from "@/features/projects/data/demo-commits";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const GitScreen = () => {
  const isLoading = useWorkspaceLoadingPreview();
  const [selectedBranch, setSelectedBranch] = useState(demoBranches[0]);

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
      {selectedBranch ? (
        <ProjectBranchSelect
          branch={selectedBranch}
          branches={demoBranches.map((branch) => branch.name)}
          onBranchChange={(name) => {
            const branch = demoBranches.find((branch) => branch.name === name);
            if (branch) setSelectedBranch(branch);
          }}
        />
      ) : null}
      <ProjectWorkspaceSearch placeholder="Search Commits" accessibilityLabel="Search commits" />
    </View>
  );
};

export default GitScreen;
