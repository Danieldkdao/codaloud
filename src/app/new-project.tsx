import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { HeadingText } from "@/components/ui/text";
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
      <AppWrapper headerShown contentContainerStyle={{ justifyContent: "center" }}>
        <HeadingText accessibilityRole="header" className="text-center text-3xl text-foreground">
          New project
        </HeadingText>
      </AppWrapper>
    </>
  );
};

export default NewProjectScreen;
