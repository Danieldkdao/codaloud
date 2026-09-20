import { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon, type IconProps } from "@/components/ui/icon";
import { ProjectCodeStatus } from "./project-code-status";

const actions: { label: string; icon: IconProps<"MaterialCommunityIcons">["name"] }[] = [
  { label: "Format code", icon: "format-align-left" },
  { label: "Organize imports", icon: "sort-alphabetical-ascending" },
  { label: "Find in file", icon: "magnify" },
  { label: "Replace in file", icon: "find-replace" },
];

export const ProjectCodeToolbar = (props: ComponentProps<typeof ProjectCodeStatus>) => {
  const [badgeHeight, setBadgeHeight] = useState(48);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="w-full"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 8 }}
    >
      <View
        testID="editor-status-measure"
        onLayout={({ nativeEvent }) => setBadgeHeight(nativeEvent.layout.height)}
      >
        <ProjectCodeStatus {...props} />
      </View>
      {actions.map((action) => (
        <GlassSurface key={action.label} borderRadius={badgeHeight / 2}>
          {/* Command buttons provide press feedback only until native tools are wired. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
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
