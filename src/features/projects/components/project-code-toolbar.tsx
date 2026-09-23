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
  { label: "Undo", icon: "undo" },
  { label: "Redo", icon: "redo" },
];

export const ProjectCodeToolbar = ({
  onFind,
  onFormat,
  onOrganize,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  disabled = false,
  ...props
}: ComponentProps<typeof ProjectCodeStatus> & {
  onFind?: () => void;
  onFormat?: () => void;
  onOrganize?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  disabled?: boolean;
}) => {
  const run = (label: string) => {
    switch (label) {
      case "Find in file":
        onFind?.();
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
      {props.analysis ? (
        <View
          testID="editor-status-measure"
          onLayout={({ nativeEvent }) =>
            setBadgeHeight(nativeEvent.layout.height)
          }
        >
          <ProjectCodeStatus {...props} />
        </View>
      ) : null}
      {actions.map((action) => (
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
