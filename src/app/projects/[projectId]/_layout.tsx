import { useLocalSearchParams } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";

export const unstable_settings = { initialRouteName: "files" };

const ProjectLayout = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <ProjectSetupGate>
      <Tabs key={projectId} asChild options={{ backBehavior: "none" }}>
        <View className="flex-1 bg-background">
          <TabSlot style={{ flex: 1 }} />
          <TabList style={{ display: "none" }}>
            <TabTrigger name="project-index" href={{ pathname: "/projects/[projectId]", params: { projectId } }} />
            <TabTrigger name="files" href={{ pathname: "/projects/[projectId]/files", params: { projectId } }} />
            <TabTrigger name="code" href={{ pathname: "/projects/[projectId]/code", params: { projectId } }} />
            <TabTrigger name="git" href={{ pathname: "/projects/[projectId]/git", params: { projectId } }} />
            <TabTrigger name="agent" href={{ pathname: "/projects/[projectId]/agent", params: { projectId } }} />
          </TabList>
          <ProjectWorkspaceDock />
        </View>
      </Tabs>
    </ProjectSetupGate>
  );
};

export default ProjectLayout;
