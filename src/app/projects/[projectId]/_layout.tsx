import { useLocalSearchParams } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { useState } from "react";
import { ProjectWorkspaceCurrentFileContext, ProjectWorkspaceBranchContext, ProjectWorkspaceDockHeightContext, ProjectWorkspaceFileCreationContext } from "@/features/projects/contexts/project-workspace-context";
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

  const [currentFile, setCurrentFile] = useState<{ projectId: string; path: string } | null>(null);

  return (
    <ProjectSetupGate>
      <ProjectWorkspaceCurrentFileContext value={{
        filePath: currentFile?.projectId === projectId ? currentFile.path : null,
        setFilePath: (nextPath) => setCurrentFile((current) => {
          // A mutation can finish after navigation. Apply its updater only to
          // this project's latest selection, never a newer project's file.
          if (typeof nextPath === "function" && current?.projectId !== projectId) return current;
          const path = typeof nextPath === "function" ? nextPath(current?.path ?? null) : nextPath;
          return path === null ? null : { projectId, path };
        }),
      }}>
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
      </ProjectWorkspaceCurrentFileContext>
    </ProjectSetupGate>
  );
};

export default ProjectLayout;
