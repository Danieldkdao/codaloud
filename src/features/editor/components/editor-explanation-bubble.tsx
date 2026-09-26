import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { GlassSurface } from "@/components/ui/glass-surface";
import { HeadingText, PText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { MarkdownText } from "@/components/markdown-text";
import type { EditorExplanationState } from "../types";

const ExplanationLoading = () => {
  const pulse = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    if (!reducedMotion)
      pulse.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  return (
    <View
      className="gap-4 pb-2"
      accessibilityRole="progressbar"
      accessibilityLabel="Explaining selected code"
      accessibilityState={{ busy: true }}
    >
      <PText className="text-muted-foreground">Reading your selection…</PText>
      {/* Only the skeleton pulses. Fading a glass ancestor can disable UIKit's material. */}
      <Animated.View style={style} className="gap-3">
        <View className="h-2 w-4/5 rounded-full bg-secondary" />
        <View className="h-2 w-full rounded-full bg-secondary" />
        <View className="h-2 w-3/5 rounded-full bg-secondary" />
      </Animated.View>
    </View>
  );
};

export const EditorExplanationBubble = ({
  state,
  maxHeight,
  onClose,
}: {
  state: EditorExplanationState;
  maxHeight: number;
  onClose: () => void;
}) => {
  const busy = state.status === "loading" || state.status === "streaming";

  return (
    <GlassSurface borderRadius={28}>
      <View className="px-4 pb-4 pt-2">
        <View className="min-h-12 flex-row items-center gap-2">
          {busy ? (
            <ActivityIndicator className="text-primary" />
          ) : (
            <Icon
              family="MaterialCommunityIcons"
              name="creation-outline"
              size={20}
              className="text-primary"
            />
          )}
          <HeadingText
            accessibilityRole="header"
            className="min-w-0 flex-1 text-lg font-semibold"
          >
            {busy ? "Explaining…" : "Explanation"}
          </HeadingText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close explanation"
            onPress={onClose}
            className="size-11 items-center justify-center rounded-full"
          >
            <Icon
              family="Feather"
              name="x"
              size={22}
              className="text-foreground"
            />
          </Pressable>
        </View>
        <ScrollView
          style={{ maxHeight: Math.max(48, maxHeight - 72) }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 4 }}
        >
          {state.text ? (
            <MarkdownText text={state.text} streaming={busy} />
          ) : busy ? (
            <ExplanationLoading />
          ) : null}
          {state.error ? (
            <PText accessibilityRole="alert" className="text-destructive">
              {state.error}
            </PText>
          ) : null}
        </ScrollView>
      </View>
    </GlassSurface>
  );
};
