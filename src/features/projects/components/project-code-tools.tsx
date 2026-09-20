import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";

type EditorToolPreview = {
  title: string;
  description: string;
  icon: IconProps<"Feather">["name"];
};

const toolGroups: { title: string; tools: EditorToolPreview[] }[] = [
  {
    title: "Find and navigate",
    tools: [
      {
        title: "Find in file",
        description: "Jump between matches in the current file.",
        icon: "search",
      },
      {
        title: "Replace in file",
        description: "Review matches and replace text.",
        icon: "repeat",
      },
      {
        title: "Go to line",
        description: "Move straight to a line number.",
        icon: "hash",
      },
    ],
  },
  {
    title: "Code tools",
    tools: [
      {
        title: "Format code",
        description: "Apply consistent spacing and indentation.",
        icon: "align-left",
      },
      {
        title: "Organize imports",
        description: "Sort imports and remove unused ones.",
        icon: "layers",
      },
      {
        title: "Toggle comment",
        description: "Comment or uncomment selected lines.",
        icon: "code",
      },
    ],
  },
  {
    title: "Appearance",
    tools: [
      {
        title: "Font and size",
        description: "Choose the typeface and text size.",
        icon: "type",
      },
      {
        title: "Word wrap",
        description: "Keep long lines within the screen.",
        icon: "corner-down-left",
      },
      {
        title: "Line numbers",
        description: "Show or hide the line-number gutter.",
        icon: "list",
      },
    ],
  },
];

export const ProjectCodeTools = () => {
  const [open, setOpen] = useState(false);
  const card = useThemeColor("card");
  const { height } = useWindowDimensions();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Editor tools"
        accessibilityHint="Opens a preview of upcoming editing commands and settings."
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
      <ContentSheet open={open} onOpenChange={setOpen} backgroundColor={card}>
        <ScrollView
          style={{ maxHeight: height * 0.75 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 32,
            gap: 24,
          }}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setOpen(false)}
        >
          {toolGroups.map((group) => (
            <View key={group.title} className="gap-2">
              <PText
                accessibilityRole="header"
                className="text-base font-semibold text-muted-foreground"
              >
                {group.title}
              </PText>
              <View className="overflow-hidden rounded-2xl border border-border bg-background">
                {group.tools.map((tool, index) => (
                  <View key={tool.title}>
                    {index > 0 ? (
                      <View className="mx-4 h-px bg-border" />
                    ) : null}
                    <Pressable
                      disabled
                      accessibilityRole="button"
                      accessibilityLabel={tool.title}
                      accessibilityHint={`${tool.description} Coming soon.`}
                      accessibilityState={{ disabled: true }}
                      className="min-h-20 flex-row items-center gap-3 px-4 py-4"
                    >
                      <View className="size-11 items-center justify-center rounded-xl bg-secondary">
                        <Icon
                          family="Feather"
                          name={tool.icon}
                          size={22}
                          className="text-secondary-foreground"
                          accessible={false}
                        />
                      </View>
                      <View className="min-w-0 flex-1 gap-1">
                        <PText className="text-base font-medium">
                          {tool.title}
                        </PText>
                        <PText className="text-base text-muted-foreground">
                          {tool.description}
                        </PText>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </ContentSheet>
    </>
  );
};
