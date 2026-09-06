import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects/components/project-form";
import { useThemeColor } from "@/hooks/use-theme";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NewProjectScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  return (
    <>
      <Stack.Screen
        options={{
          title: "New project",
          contentStyle: { backgroundColor: background },
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerRight: () => (
            <Button variant="ghost" onPress={() => router.back()} accessibilityLabel="Close new project">
              Done
            </Button>
          ),
        }}
      />
      {/* Content-sized sheets need a wrapper that does not fill the screen. */}
      <AppWrapper
        scrollable={false}
        className="flex-none"
        // iOS adds the header and bottom safe area to the fitted sheet height.
        // Keep top padding for the overlay header, but count its height only once.
        style={
          process.env.EXPO_OS === "ios"
            ? { paddingBottom: 24, marginBottom: -insets.top }
            : undefined
        }
      >
        <ProjectForm />
      </AppWrapper>
    </>
  );
};

export default NewProjectScreen;
