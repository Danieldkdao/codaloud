import { EditorControlsProvider } from "@/features/editor/use-editor-controls";
import { AgentWorkspaceBridge } from "@/features/agent/hooks/use-agent-workspace";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useThemeColor } from "@/hooks/use-theme";
import { Keyboard, View } from "react-native";
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceCurrentFileProvider } from "@/features/projects/hooks/use-project-workspace-current-file";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { ProjectWorkspaceFileSearchProvider } from "@/features/projects/hooks/use-project-workspace-file-search";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectWorkspaceChangesProvider } from "@/features/projects/hooks/use-project-workspace-changes";
import { ProjectFileSaveRegistryProvider } from "@/features/projects/hooks/use-project-file-save";

import { Button } from "@/components/ui/button";
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
  const showDock = name === "code";
  return (
    <EditorControlsProvider>
      <ProjectWorkspaceDockHeightProvider>
        <View className="flex-1 bg-background">
          {children}
          {showDock ? <ProjectWorkspaceDock tab={name} /> : null}
        </View>
      </ProjectWorkspaceDockHeightProvider>
    </EditorControlsProvider>
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
  const foreground = useThemeColor("foreground");
  const router = useRouter();

  return (
    <ProjectWorkspaceCurrentFileProvider projectId={projectId}>
      <ProjectWorkspaceFileCreationProvider projectId={projectId}>
        <ProjectWorkspaceBranchProvider>
          <ProjectWorkspaceChangesProvider>
            <ProjectSetupGate>
              <ProjectFileSaveRegistryProvider projectId={projectId}>
                <AgentWorkspaceBridge />
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
                    <Stack.Screen
                      name="git"
                      options={{ presentation: "modal" }}
                    />
                    <Stack.Screen
                      name="agent"
                      options={{
                        presentation: "modal",
                        title: "Agent",
                        headerShown: true,
                        headerBackVisible: false,
                        headerStyle: { backgroundColor: background },
                        headerTintColor: foreground,
                        headerShadowVisible: false,
                        headerTitleStyle: {
                          fontFamily: "Fraunces_500Medium",
                          fontSize: 22,
                        },
                        headerRight: () => (
                          <Button
                            variant="ghost"
                            onPress={() => {
                              Keyboard.dismiss();
                              router.dismissTo({
                                pathname: "/projects/[projectId]/code",
                                params: { projectId },
                              });
                            }}
                          >
                            Done
                          </Button>
                        ),
                      }}
                    />
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
