import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { ProjectSandboxState } from "@/features/projects/components/project-sandbox-state";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { useThemeColor } from "@/hooks/use-theme";

export const ProjectSetupGate = ({ children }: { children: ReactNode }) => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const verticalPadding = Math.max(insets.top, insets.bottom) + 24;
  const horizontalPadding = Math.max(insets.left, insets.right) + 24;
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const { data: project, isError, isFetching, refetch } = useProject(projectId);

  const setupReady = !isError && project?.setupStatus === "ready";
  const { query: workspace } = useProjectFiles(projectId, "", { enabled: setupReady, verifyOnMount: true });
  // A successful root read proves the sandbox is running and warms the Files tab.
  // Background refreshes alone must not unmount the editor or other workspace tabs.
  const ready = setupReady && workspace.isFetchedAfterMount && workspace.isSuccess && workspace.failureCount === 0;
  const workspaceError = setupReady && workspace.isError;
  const checking = workspaceError ? workspace.isFetching : isFetching;
  useEffect(() => {
    if (ready) setOpenedProjectId(projectId);
  }, [projectId, ready]);

  return (
    // Keep a native screen root so replacing a form sheet cannot retain its ScrollView bounds.
    <View collapsable={false} style={{ flex: 1, backgroundColor: background }}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerShown: true,
          headerTransparent: !ready,
          headerTitle: ready ? project?.name : "",
          headerTitleStyle: {
            fontSize: 22,
            fontFamily: "Fraunces_500Medium",
          },
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Home"
              accessibilityHint="Returns to your projects"
              onPress={() => router.dismissTo("/(main)")}
              className="size-11 items-center justify-center rounded-full active:bg-secondary"
            >
              <Icon family="Feather" name="home" size={22} accessible={false} className="text-foreground" />
            </Pressable>
          ),
        }}
      />
      {setupReady && (ready || openedProjectId === projectId) && (
        // Preserve local editor state during later restoration while making every
        // workspace control unavailable, including to native accessibility services.
        <View
          key={projectId}
          style={{ flex: 1, display: ready ? "flex" : "none" }}
          pointerEvents={ready ? "auto" : "none"}
          accessibilityElementsHidden={!ready}
          importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
        >
          {children}
        </View>
      )}
      {!ready && (
        <AppWrapper
          headerShown
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={{
            // Symmetric safe-area padding centers the whole state in the screen,
            // rather than shifting it down beneath the transparent navigation bar.
            justifyContent: "center",
            alignItems: "center",
            paddingTop: verticalPadding,
            paddingBottom: verticalPadding,
            paddingLeft: horizontalPadding,
            paddingRight: horizontalPadding,
          }}
        >
          {isError || project?.setupStatus === "failed" || workspaceError ? (
            <View className="items-center gap-4">
              <PText
                selectable
                accessibilityRole="alert"
                className="text-center"
              >
                {isError
                  ? "Unable to load your sandbox. Please try again."
                  : workspaceError
                    ? "Unable to start your sandbox. Please try again."
                    : "Sandbox setup couldn’t finish. Please check back later."}
              </PText>
              <Button
                variant="outline"
                disabled={checking}
                onPress={() => void (workspaceError ? workspace.refetch() : refetch())}
              >
                {checking ? "Checking…" : "Refresh status"}
              </Button>
            </View>
          ) : (
            <ProjectSandboxState ready={false} restoring={!project || setupReady} />
          )}
        </AppWrapper>
      )}
    </View>
  );
};
