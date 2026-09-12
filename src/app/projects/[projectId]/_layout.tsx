import { useLocalSearchParams } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceCurrentFileProvider } from "@/features/projects/hooks/use-project-workspace-current-file";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectFileSaveRegistryProvider } from "@/features/projects/hooks/use-project-file-save";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";

export const unstable_settings = { initialRouteName: "files" };

const ProjectLayout = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <ProjectWorkspaceCurrentFileProvider projectId={projectId}>
      <ProjectWorkspaceFileCreationProvider projectId={projectId}>
        <ProjectWorkspaceBranchProvider>
          <ProjectWorkspaceDockHeightProvider>
            <ProjectSetupGate>
              <ProjectFileSaveRegistryProvider projectId={projectId}>
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
              </ProjectFileSaveRegistryProvider>
            </ProjectSetupGate>
          </ProjectWorkspaceDockHeightProvider>
        </ProjectWorkspaceBranchProvider>
      </ProjectWorkspaceFileCreationProvider>
    </ProjectWorkspaceCurrentFileProvider>
  );
};

export default ProjectLayout;
