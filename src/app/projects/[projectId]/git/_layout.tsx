import { Stack } from "expo-router";

import { useThemeColor } from "@/hooks/use-theme";

export const unstable_settings = { initialRouteName: "index" };

const GitLayout = () => {
  const background = useThemeColor("background");

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="workspace-diff" />
    </Stack>
  );
};

export default GitLayout;
