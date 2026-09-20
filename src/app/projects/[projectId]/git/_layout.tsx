import {
  Stack,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import { Keyboard, Pressable } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProjectSearchOverlayProvider } from "@/features/projects/components/project-search-overlay";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";
import { getProjectCommitDiffParams } from "@/features/projects/lib/commit-params";
import { formatCommitHash } from "@/features/projects/lib/formatters";
import { useThemeColor } from "@/hooks/use-theme";

export const unstable_settings = { initialRouteName: "index" };

const GitLayout = () => {
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { commitSha, source } = useGlobalSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isDiff = pathname.endsWith("/workspace-diff");
  const commit = getProjectCommitDiffParams(commitSha, source);

  return (
    <ProjectSearchOverlayProvider bottomAligned>
      <Stack
        screenOptions={{
          headerBackVisible: false,
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Fraunces_500Medium", fontSize: 22 },
          contentStyle: { backgroundColor: background },
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
        <Stack.Screen name="index" options={{ title: "Git" }} />
        <Stack.Screen
          name="workspace-diff"
          options={{
            title: commit
              ? formatCommitHash(commit.commitSha)
              : "Workspace diff",
            headerLeft: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to Git"
                accessibilityHint="Returns to your changes"
                className="size-11 items-center justify-center rounded-full active:bg-secondary"
                onPress={() => {
                  Keyboard.dismiss();
                  router.dismissTo({
                    pathname: "/projects/[projectId]/git",
                    params: { projectId },
                  });
                }}
              >
                <Icon
                  family="Feather"
                  name="chevron-left"
                  size={22}
                  accessible={false}
                  className="text-foreground"
                />
              </Pressable>
            ),
          }}
        />
      </Stack>
      {!isDiff && <ProjectWorkspaceDock tab="git" />}
    </ProjectSearchOverlayProvider>
  );
};

export default GitLayout;
