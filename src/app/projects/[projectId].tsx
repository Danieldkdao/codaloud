import { Stack, useLocalSearchParams } from "expo-router";

import { AppWrapper } from "@/components/app-wrapper";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";

const ProjectScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  return (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerShown: false,
        }}
      />
      <AppWrapper>
        <PText selectable>Project ID: {projectId}</PText>
      </AppWrapper>
    </>
  );
};

export default ProjectScreen;
