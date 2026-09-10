import { useLocalSearchParams } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { useState } from "react";
import { ProjectWorkspaceBranchContext, ProjectWorkspaceDockHeightContext, ProjectWorkspaceFileCreationContext } from "@/features/projects/contexts/project-workspace-context";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";
import { demoBranches } from "@/features/projects/data/demo-commits";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";

export const unstable_settings = { initialRouteName: "files" };

const ProjectLayout = () => {
  const [dockHeight, setDockHeight] = useState(0);
  const [branch, setBranch] = useState(demoBranches[0]);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [creation, setCreation] = useState<{ projectId: string; kind: ProjectFileKind } | null>(null);

  return (
    <ProjectSetupGate>
      <ProjectWorkspaceFileCreationContext value={{
        kind: creation?.projectId === projectId ? creation.kind : null,
        begin: (kind) => setCreation((current) => current?.projectId === projectId ? current : { projectId, kind }),
        finish: () => setCreation((current) => current?.projectId === projectId ? null : current),
      }}>
        <ProjectWorkspaceBranchContext value={{ branch, setBranch }}>
          <ProjectWorkspaceDockHeightContext value={dockHeight}>
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
                <ProjectWorkspaceDock onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)} />
              </View>
            </Tabs>
          </ProjectWorkspaceDockHeightContext>
        </ProjectWorkspaceBranchContext>
      </ProjectWorkspaceFileCreationContext>
    </ProjectSetupGate>
  );
};

export default ProjectLayout;
