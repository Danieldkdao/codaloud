import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  formatBillingTab,
  formatBillingTabIcon,
  type BillingTab,
} from "../lib/formatters";

const tabs: BillingTab[] = ["usage", "plans", "subscription", "history"];

type BillingTabsProps = {
  tab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
};

export const BillingTabs = ({ tab, onTabChange }: BillingTabsProps) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const position = useSharedValue(0);
  const segmentWidth = Math.max(0, (layout.width - 8) / tabs.length);

  useEffect(() => {
    position.value = withSpring(tabs.indexOf(tab), {
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
      className="rounded-full bg-primary/10 p-1"
      onLayout={(event) => setLayout(event.nativeEvent.layout)}
    >
      {layout.width > 0 && (
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
          <GlassSurface borderRadius={28}>
            <View
              className="bg-primary/10"
              style={{ height: Math.max(0, layout.height - 8) }}
            />
          </GlassSurface>
        </Animated.View>
      )}
      <View className="flex-row">
        {tabs.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={formatBillingTab(value)}
            accessibilityState={{ selected: tab === value }}
            onPress={() => onTabChange(value)}
            className="min-h-14 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-1 py-2"
          >
            <Icon
              family="Feather"
              name={formatBillingTabIcon(value)}
              size={17}
              className={cn(
                tab === value ? "text-primary" : "text-muted-foreground",
              )}
              accessible={false}
            />
            <PText
              numberOfLines={1}
              className={cn(
                "text-center text-base",
                tab === value
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {formatBillingTab(value)}
            </PText>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export const BillingTabPanel = ({
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
      style={[{ display: active ? "flex" : "none" }, style]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
};
