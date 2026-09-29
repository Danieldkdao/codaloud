import { Stack } from "expo-router";
import { Platform } from "react-native";

import { FORM_SHEET_OPTIONS, MODAL_SCREEN_OPTIONS } from "@/lib/constants";
import { useThemeColor } from "@/hooks/use-theme";

const DraftsLayout = () => {
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  return (
    <Stack
      screenOptions={{
        ...MODAL_SCREEN_OPTIONS,
        headerTintColor: foreground,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: background },
        contentStyle: { backgroundColor: background },
      }}
    >
      <Stack.Screen
        name="[draftId]"
        options={{
          presentation: Platform.OS === "ios" ? "pageSheet" : "modal",
        }}
      />
      <Stack.Screen
        name="copy-to-project"
        options={{
          presentation: "formSheet",
          headerShown: false,
          ...FORM_SHEET_OPTIONS,
          title: "Copy to project",
        }}
      />
    </Stack>
  );
};

export default DraftsLayout;
