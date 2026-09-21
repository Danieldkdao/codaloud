import { AppWrapper } from "@/components/app-wrapper";
import { View } from "react-native";
import { EditorSettings } from "./editor-settings";

export const EditorSettingsScreen = () => (
  <AppWrapper headerShown>
    <View className="w-full max-w-xl self-center">
      <EditorSettings />
    </View>
  </AppWrapper>
);
