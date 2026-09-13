import { Stack } from "expo-router";
import { useThemeColor } from "@/hooks/use-theme";

export const unstable_settings = { initialRouteName: "index" };

const FilesLayout = () => {
  const background = useThemeColor("background");

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="preview" />
    </Stack>
  );
};

export default FilesLayout;
