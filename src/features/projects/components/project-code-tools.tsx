import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { EditorSettings } from "@/features/settings/components/editor-settings";
import { useThemeColor } from "@/hooks/use-theme";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";

export const ProjectCodeTools = () => {
  const [open, setOpen] = useState(false);
  const background = useThemeColor("background");
  const { height } = useWindowDimensions();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Editor tools"
        accessibilityHint="Opens editor appearance and editing settings."
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon
          family="Feather"
          name="sliders"
          size={22}
          className="text-foreground"
          accessible={false}
        />
      </Pressable>
      <ContentSheet
        open={open}
        onOpenChange={setOpen}
        backgroundColor={background}
        scrollable={false}
      >
        <View
          style={{ maxHeight: height * 0.85, flexShrink: 1 }}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setOpen(false)}
        >
          <View className="min-h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5">
            <HeadingText
              accessibilityRole="header"
              className="min-w-0 flex-1 text-xl font-semibold text-foreground"
            >
              Editor settings
            </HeadingText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setOpen(false)}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              <PText className="font-semibold text-primary">Done</PText>
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
            }}
          >
            <EditorSettings />
          </ScrollView>
        </View>
      </ContentSheet>
    </>
  );
};
