import { useLocalSearchParams, useRouter } from "expo-router";
import { Stack } from "expo-router/js-stack";
import { Keyboard } from "react-native";
import { KeyboardAwareView } from "@/components/ui/keyboard-aware-view";
import { Button } from "@/components/ui/button";
import { ProjectFilesToolbar } from "@/features/projects/components/project-files-toolbar";
import { useThemeColor } from "@/hooks/use-theme";

export const unstable_settings = { initialRouteName: "index" };

const FilesLayout = () => {
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();

  return (
    <KeyboardAwareView className="flex-1 bg-background" style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          title: "Files",
          headerLeft: () => null,
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: "Fraunces_500Medium",
            fontSize: 22,
          },
          cardStyle: { backgroundColor: background },
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
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="preview" />
      </Stack>
      <ProjectFilesToolbar commandScope={`/projects/${projectId}/files`} />
    </KeyboardAwareView>
  );
};

export default FilesLayout;
