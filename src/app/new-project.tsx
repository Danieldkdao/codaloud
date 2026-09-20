import { KeyboardSymbolsProvider } from "@/components/keyboard-symbols-provider";
import { Button } from "@/components/ui/button";
import { CreateProjectForm } from "@/features/projects/components/create-project-form";
import { useThemeColor } from "@/hooks/use-theme";
import { Stack, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
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
          contentStyle: {
            backgroundColor: Platform.OS === "ios" ? "transparent" : background,
          },
          headerStyle: {
            backgroundColor: Platform.OS === "ios" ? "transparent" : background,
          },
          headerTintColor: foreground,
          headerShadowVisible: false,
          headerRight: () => (
            <Button
              variant="ghost"
              onPress={() => router.back()}
              accessibilityLabel="Close new project"
            >
              Done
            </Button>
          ),
        }}
      />
      {/* Bound the sheet and reserve room for the fixed submit button above the keyboard. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        collapsable={false}
        style={{
          maxHeight: height - insets.top - insets.bottom,
          // The iOS sheet header overlays content; these sibling scroll areas use explicit insets.
          paddingTop: Platform.OS === "ios" ? insets.top : 0,
          // fitToContents adds native header and bottom insets to its measured height.
          // They are already included above and in AppWrapper, so count them only once.
          marginBottom: Platform.OS === "ios" ? -insets.top - insets.bottom : 0,
        }}
      >
        {/* Native sheets resize the first descendant ScrollView to the entire sheet.
            End that lookup here: our sibling scroll areas are sized by the form. */}
        <View collapsable={false} pointerEvents="none" />
        <KeyboardSymbolsProvider local>
          <CreateProjectForm />
        </KeyboardSymbolsProvider>
      </KeyboardAvoidingView>
    </>
  );
};

export default NewProjectScreen;
