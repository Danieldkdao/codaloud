import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { EditProjectContent } from "@/features/projects/components/edit-project-content";
import { useThemeColor } from "@/hooks/use-theme";

const EditProjectScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  if (typeof projectId !== "string" || !projectId.trim()) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit project",
          contentStyle: { backgroundColor: background },
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerRight: () => (
            <Button variant="ghost" onPress={() => router.back()} accessibilityLabel="Close edit project">
              Done
            </Button>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        collapsable={false}
        className="bg-background"
        style={{
          maxHeight: height - insets.top - insets.bottom,
          // Match the create sheet's explicit header inset without counting native insets twice.
          paddingTop: Platform.OS === "ios" ? insets.top : 0,
          marginBottom: Platform.OS === "ios" ? -insets.top - insets.bottom : 0,
        }}
      >
        {/* Keep native sheet sizing from expanding the form's nested ScrollView. */}
        <View collapsable={false} pointerEvents="none" />
        {/* Mount the query only with an ID, and reset the draft when the target changes. */}
        <EditProjectContent key={projectId} projectId={projectId} />
      </KeyboardAvoidingView>
    </>
  );
};

export default EditProjectScreen;
