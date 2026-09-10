import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { themePreferences } from "@/lib/constants";
import type { ThemePreference } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { formatThemePreference, formatThemePreviewClassName } from "../lib/formatters";

const PreviewWindow = ({ preference }: { preference: ThemePreference }) => (
  <View className="h-16 w-14 flex-row overflow-hidden rounded-xl border border-border" accessible={false} importantForAccessibility="no-hide-descendants">
    {(preference === "system" ? ["light", "dark"] as const : [preference]).map((mode) => (
      <View key={mode} className={cn("flex-1 gap-1.5 bg-background p-1.5", formatThemePreviewClassName(mode))}>
        <View className="h-2 w-3 rounded-full bg-primary" />
        <View className="gap-1 rounded-md bg-card p-1">
          <View className="h-1 rounded-full bg-secondary" />
          <View className="h-1 w-2/3 rounded-full bg-secondary" />
        </View>
        <View className="h-1 w-2/3 rounded-full bg-muted-foreground/40" />
      </View>
    ))}
  </View>
);

export const AppearanceSelector = () => {
  const { preference, setPreference, isReady, error } = useTheme();
  const [width, setWidth] = useState(0);
  const selectedIndex = themePreferences.indexOf(preference);
  const segmentWidth = Math.max(0, (width - 8) / 3);
  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: withSpring(selectedIndex * segmentWidth, {
      damping: 24, stiffness: 260, mass: 0.8, reduceMotion: ReduceMotion.System,
    }) }],
  }));

  return (
    <View className="gap-3 p-3">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Appearance"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        className="relative flex-row rounded-xl bg-background p-1"
      >
        {width > 0 && <Animated.View
          pointerEvents="none"
          className="absolute bottom-1 left-1 top-1 rounded-lg bg-secondary"
          style={indicatorStyle}
        />}
        {themePreferences.map((mode) => {
          const { label, icon } = formatThemePreference(mode);
          const selected = preference === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled: !isReady }}
              disabled={!isReady}
              onPress={() => setPreference(mode)}
              className="min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-3 active:opacity-70 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <PreviewWindow preference={mode} />
              <View className="flex-row flex-wrap items-center justify-center gap-1.5">
                <Icon {...icon} size={16} className="text-secondary-foreground" accessible={false} />
                <PText className="font-medium text-foreground">{label}</PText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <PText accessibilityLiveRegion="polite" className="text-center text-muted-foreground">
        {formatThemePreference(preference).description}
      </PText>
      {error && <PText accessibilityRole="alert" className="text-destructive">{error}</PText>}
    </View>
  );
};
