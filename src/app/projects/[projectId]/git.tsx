import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectChangesPanel } from "@/features/projects/components/project-changes-panel";
import { ProjectCommitList } from "@/features/projects/components/project-commit-list";
import { ProjectGitTabPanel, ProjectGitTabs } from "@/features/projects/components/project-git-tabs";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { demoChanges } from "@/features/projects/data/demo-changes";

const GitScreen = () => {
  const { gitTab: tab, setGitTab: setTab } = useProjectWorkspaceBranch();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: 12, paddingBottom: 8, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }}>
        <ProjectGitTabs tab={tab} onTabChange={setTab} />
      </View>
      <ProjectGitTabPanel active={tab === "changes"}>
        <ProjectChangesPanel changes={demoChanges} />
      </ProjectGitTabPanel>
      <ProjectGitTabPanel active={tab === "history"}>
        <ProjectCommitList active={tab === "history"} />
      </ProjectGitTabPanel>
    </View>
  );
};

export default GitScreen;
