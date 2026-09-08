import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { ProjectSandboxState } from "@/features/projects/components/project-sandbox-state";
import { SandboxScaffold } from "@/features/projects/components/sandbox-scaffold";
import { useProject } from "@/features/projects/hooks/use-project";
import { useThemeColor } from "@/hooks/use-theme";

const ProjectScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const verticalPadding = Math.max(insets.top, insets.bottom) + 24;
  const horizontalPadding = Math.max(insets.left, insets.right) + 24;
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const { data: project, isError, isFetching, refetch } = useProject(projectId);

  return (
    // Keep a native screen root so replacing a form sheet cannot retain its ScrollView bounds.
    <View collapsable={false} style={{ flex: 1, backgroundColor: background }}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerShown: true,
          headerTransparent: true,
          title: "",
          headerBackButtonDisplayMode: "minimal",
          headerBackTitleStyle: {},
        }}
      />
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
        {isError || project?.setupStatus === "failed" ? (
          <View className="items-center gap-4">
            <PText selectable accessibilityRole="alert" className="text-center text-muted-foreground">
              {isError
                ? "Unable to load your sandbox. Please try again."
                : "Sandbox setup couldn’t finish. Please check back later."}
            </PText>
            <Button variant="outline" disabled={isFetching} onPress={() => void refetch()}>
              {isFetching ? "Checking…" : "Refresh status"}
            </Button>
          </View>
        ) : project ? (
          <ProjectSandboxState ready={project.setupStatus === "ready"} />
        ) : (
          <View className="items-center gap-6">
            <SandboxScaffold />
            <PText className="text-center text-muted-foreground">Opening your sandbox…</PText>
          </View>
        )}
      </AppWrapper>
    </View>
  );
};

export default ProjectScreen;
