import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";
import { View } from "react-native";
import { EditorSettings } from "./editor-settings";

export const EditorSettingsScreen = () => (
  <AppWrapper headerShown>
    <View className="w-full max-w-xl gap-6 self-center">
      <HeadingText
        accessibilityRole="header"
        className="text-3xl font-semibold"
      >
        Editor Settings
      </HeadingText>
      <View className="h-px bg-border" />
      <EditorSettings settings />
    </View>
  </AppWrapper>
);
