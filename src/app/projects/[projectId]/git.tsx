import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectChangesPanel } from "@/features/projects/components/project-changes-panel";
import { ProjectCommitList } from "@/features/projects/components/project-commit-list";
import { ProjectGitTabPanel, ProjectGitTabs } from "@/features/projects/components/project-git-tabs";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";
import { demoChanges } from "@/features/projects/data/demo-changes";
import type { ProjectGitTab } from "@/features/projects/types";

const GitScreen = () => {
  const [tab, setTab] = useState<ProjectGitTab>("changes");
  const insets = useSafeAreaInsets();
  const isLoading = useWorkspaceLoadingPreview();
  const { branch: selectedBranch } = useProjectWorkspaceBranch();

  if (isLoading) {
    return (
      <ProjectWorkspaceState
        isLoading
        icon="git-commit"
        title="Loading changes…"
        description="Getting your Git workspace ready."
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: 12, paddingBottom: 8, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }}>
        <ProjectGitTabs tab={tab} onTabChange={setTab} />
      </View>
      <ProjectGitTabPanel active={tab === "changes"}>
        <ProjectChangesPanel key={selectedBranch?.name} changes={selectedBranch ? demoChanges : []} />
      </ProjectGitTabPanel>
      <ProjectGitTabPanel active={tab === "history"}>
        <ProjectCommitList
          key={selectedBranch?.name}
          commits={selectedBranch?.commits ?? []}
        />
      </ProjectGitTabPanel>
    </View>
  );
};

export default GitScreen;
