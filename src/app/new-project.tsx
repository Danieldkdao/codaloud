import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects/components/project-form";
import { useThemeColor } from "@/hooks/use-theme";
import { Stack, useRouter } from "expo-router";

const NewProjectScreen = () => {
  const router = useRouter();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  return (
    <>
      <Stack.Screen
        options={{
          title: "New project",
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
      <AppWrapper headerShown>
        <ProjectForm />
      </AppWrapper>
    </>
  );
};

export default NewProjectScreen;
