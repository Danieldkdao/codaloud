import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassSurface } from "@/components/ui/glass-surface";
import { PText } from "@/components/ui/text";
import { formatProjectGitTab } from "@/features/projects/lib/formatters";
import type { ProjectGitTab } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectGitTabsProps = {
  tab: ProjectGitTab;
  onTabChange: (tab: ProjectGitTab) => void;
};

const tabs: ProjectGitTab[] = ["changes", "history"];

export const ProjectGitTabs = ({ tab, onTabChange }: ProjectGitTabsProps) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const position = useSharedValue(0);
  const segmentWidth = Math.max(0, (layout.width - 8) / 2);

  useEffect(() => {
    position.value = withSpring(tab === "changes" ? 0 : 1, {
      damping: 60,
      stiffness: 280,
      reduceMotion: ReduceMotion.System,
    });
  }, [tab, position]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segmentWidth }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      className="rounded-full bg-secondary/50 p-1"
      onLayout={(event) => setLayout(event.nativeEvent.layout)}
    >
      {layout.width > 0 ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              left: 4,
              width: segmentWidth,
            },
            indicatorStyle,
          ]}
        >
          <GlassSurface borderRadius={28} shadow={false}>
            <View style={{ height: Math.max(0, layout.height - 8) }} />
          </GlassSurface>
        </Animated.View>
      ) : null}
      <View className="flex-row">
        {tabs.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={formatProjectGitTab(value)}
            accessibilityState={{ selected: tab === value }}
            onPress={() => {
              Keyboard.dismiss();
              onTabChange(value);
            }}
            className="min-h-12 min-w-0 flex-1 items-center justify-center rounded-full px-2 py-3"
          >
            <PText
              className={cn(
                "text-center text-base",
                tab === value
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {formatProjectGitTab(value)}
            </PText>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

// Keep each view mounted so changing tabs retains its scroll position and draft.
export const ProjectGitTabPanel = ({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) => {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ flex: 1, display: active ? "flex" : "none" }, style]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
};
