import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";

export const CodeEditorLoading = ({
  bottomInset = 0,
}: {
  bottomInset?: number;
}) => {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      className="absolute inset-0 items-center justify-center gap-5 bg-background px-6"
      style={{ paddingBottom: bottomInset }}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Initializing your editor"
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
    >
      <View className="w-28 gap-4 rounded-3xl border border-border bg-card p-5">
        <Icon family="Feather" name="code" size={28} className="text-primary" />
        <Animated.View className="gap-2" style={pulseStyle}>
          <View className="h-1.5 w-full rounded-full bg-primary/35" />
          <View className="ml-3 h-1.5 w-10 rounded-full bg-primary/20" />
          <View className="h-1.5 w-12 rounded-full bg-primary/35" />
        </Animated.View>
      </View>
      <View className="items-center gap-2">
        <PText className="text-center text-xl text-foreground font-medium">
          Initializing your editor…
        </PText>
        <PText className="text-center text-lg">
          Getting your code ready.
        </PText>
      </View>
    </Animated.View>
  );
};
