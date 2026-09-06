import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects/components/project-form";
import { useThemeColor } from "@/hooks/use-theme";
import { Stack, useRouter } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NewProjectScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
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
      {/* Keep the fitted sheet compact, but give overflowing content a bounded scroll viewport. */}
      <AppWrapper
        className="flex-none"
        headerShown
        nestedScrollEnabled
        keyboardDismissMode="on-drag"
        style={{ maxHeight: height - insets.top - insets.bottom }}
        contentContainerStyle={{ flexGrow: 0 }}
      >
        <ProjectForm />
      </AppWrapper>
    </>
  );
};

export default NewProjectScreen;
