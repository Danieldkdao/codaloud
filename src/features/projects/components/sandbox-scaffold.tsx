import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useThemeColor } from "@/hooks/use-theme";

type ScaffoldLayerProps = {
  index: number;
  progress: SharedValue<number>;
  still: boolean;
};

const ScaffoldLayer = ({ index, progress, still }: ScaffoldLayerProps) => {
  const background = useThemeColor("background");
  const secondary = useThemeColor("secondary");
  const foreground = useThemeColor("secondary-foreground");
  const style = useAnimatedStyle(() => {
    // Build from the foundation upward, hold, then gently lift apart again.
    const start = (2 - index) * 0.14;
    const assembled = still ? 1 : interpolate(
      progress.value,
      [start, start + 0.24, 0.76, 1],
      [0, 1, 1, 0],
      "clamp",
    );

    return {
      opacity: 0.22 + assembled * 0.78,
      transform: [{ translateY: -22 * (1 - assembled) }],
    };
  });

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 54, top: 20 + index * 30 },
        style,
      ]}
    >
      <View
        style={{
          width: 116,
          height: 116,
          padding: 15,
          borderWidth: 1.5,
          borderColor: foreground,
          borderRadius: 22,
          borderCurve: "continuous",
          backgroundColor: background,
          transform: [{ scaleY: 0.56 }, { rotate: "45deg" }],
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 12,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: foreground,
            backgroundColor: secondary,
            opacity: 0.7,
          }}
        />
      </View>
    </Animated.View>
  );
};

export const SandboxScaffold = ({ ready = false }: { ready?: boolean }) => {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const still = ready || reducedMotion;

  useFocusEffect(useCallback(() => {
    if (still) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 3_600, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, still]));

  return (
    <View
      style={{ width: 224, height: 204 }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[2, 1, 0].map((index) => (
        <ScaffoldLayer key={index} index={index} progress={progress} still={still} />
      ))}
    </View>
  );
};
