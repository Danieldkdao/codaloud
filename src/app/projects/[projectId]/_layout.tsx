import { Stack, useLocalSearchParams, usePathname } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useThemeColor } from "@/hooks/use-theme";
import { View } from "react-native";
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceCurrentFileProvider } from "@/features/projects/hooks/use-project-workspace-current-file";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { ProjectWorkspaceFileSearchProvider } from "@/features/projects/hooks/use-project-workspace-file-search";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectWorkspaceChangesProvider } from "@/features/projects/hooks/use-project-workspace-changes";
import { ProjectFileSaveRegistryProvider } from "@/features/projects/hooks/use-project-file-save";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";

export const unstable_settings = { initialRouteName: "code", anchor: "code" };

const WorkspaceScreen = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const showDock =
    (name === "code" || name === "git" || name === "agent") &&
    !(name === "git" && pathname.endsWith("/workspace-diff"));
  return (
    <ProjectWorkspaceDockHeightProvider>
      <View className="flex-1 bg-background">
        {children}
        {showDock ? <ProjectWorkspaceDock tab={name} /> : null}
      </View>
    </ProjectWorkspaceDockHeightProvider>
  );
};

const screenLayout: NonNullable<
  ComponentProps<typeof Stack>["screenLayout"]
> = ({ children, route }) => (
  <WorkspaceScreen name={route.name}>{children}</WorkspaceScreen>
);

const ProjectLayout = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const background = useThemeColor("background");

  return (
    <ProjectWorkspaceCurrentFileProvider projectId={projectId}>
      <ProjectWorkspaceFileCreationProvider projectId={projectId}>
        <ProjectWorkspaceBranchProvider>
          <ProjectWorkspaceChangesProvider>
            <ProjectSetupGate>
              <ProjectFileSaveRegistryProvider projectId={projectId}>
                <ProjectWorkspaceFileSearchProvider key={projectId}>
                  <Stack
                    key={projectId}
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: background },
                    }}
                    screenLayout={screenLayout}
                  >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="code" />
                    <Stack.Screen name="git" />
                    <Stack.Screen name="agent" />
                    <Stack.Screen
                      name="files"
                      options={{ presentation: "modal" }}
                    />
                  </Stack>
                </ProjectWorkspaceFileSearchProvider>
              </ProjectFileSaveRegistryProvider>
            </ProjectSetupGate>
          </ProjectWorkspaceChangesProvider>
        </ProjectWorkspaceBranchProvider>
      </ProjectWorkspaceFileCreationProvider>
    </ProjectWorkspaceCurrentFileProvider>
  );
};

export default ProjectLayout;
