import { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon, type IconProps } from "@/components/ui/icon";
import { ProjectCodeStatus } from "./project-code-status";

const actions: {
  label: string;
  icon: IconProps<"MaterialCommunityIcons">["name"];
}[] = [
  { label: "Format code", icon: "format-align-left" },
  { label: "Organize imports", icon: "sort-alphabetical-ascending" },
  { label: "Find in file", icon: "magnify" },
  { label: "Insert from draft", icon: "book-plus" },
  { label: "Terminal", icon: "console" },
  { label: "Undo", icon: "undo" },
  { label: "Redo", icon: "redo" },
];

export const ProjectCodeToolbar = ({
  onFind,
  onInsertFromDraft,
  onTerminal,
  onFormat,
  onOrganize,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  disabled = false,
  draft = false,
  ...props
}: ComponentProps<typeof ProjectCodeStatus> & {
  onFind?: () => void;
  onInsertFromDraft?: () => void;
  onTerminal?: () => void;
  onFormat?: () => void;
  onOrganize?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  disabled?: boolean;
  draft?: boolean;
}) => {
  const run = (label: string) => {
    switch (label) {
      case "Find in file":
        onFind?.();
        break;
      case "Insert from draft":
        onInsertFromDraft?.();
        break;
      case "Terminal":
        onTerminal?.();
        break;
      case "Undo":
        onUndo?.();
        break;
      case "Redo":
        onRedo?.();
        break;
      case "Format code":
        onFormat?.();
        break;
      case "Organize imports":
        onOrganize?.();
        break;
    }
  };
  const [badgeHeight, setBadgeHeight] = useState(48);

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      className="w-full"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      {props.analysis && props.analysis.status !== "unsupported" ? (
        <View
          testID="editor-status-measure"
          onLayout={({ nativeEvent }) =>
            setBadgeHeight(nativeEvent.layout.height)
          }
        >
          <ProjectCodeStatus {...props} />
        </View>
      ) : null}
      {actions
        .filter(
          (action) =>
            !draft ||
            (action.label !== "Insert from draft" &&
              action.label !== "Terminal"),
        )
        .map((action) => (
          <GlassSurface key={action.label} borderRadius={badgeHeight / 2}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              disabled={
                disabled ||
                (action.label === "Undo" && !canUndo) ||
                (action.label === "Redo" && !canRedo)
              }
              accessibilityState={{
                disabled:
                  disabled ||
                  (action.label === "Undo" && !canUndo) ||
                  (action.label === "Redo" && !canRedo),
              }}
              onPress={() => run(action.label)}
              className="items-center justify-center rounded-full active:opacity-60"
              style={{ width: badgeHeight, height: badgeHeight }}
            >
              <Icon
                family="MaterialCommunityIcons"
                name={action.icon}
                size={22}
                className="text-foreground"
                accessible={false}
              />
            </Pressable>
          </GlassSurface>
        ))}
    </ScrollView>
  );
};
