import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { VoiceConversation } from "../hooks/use-voice-conversation";

export const VoiceMicrophone = ({
  conversation,
  compact = false,
}: {
  conversation: VoiceConversation;
  compact?: boolean;
}) => {
  const { state, pressed } = conversation;
  const foreground = useThemeColor("foreground");
  const primaryForeground = useThemeColor("primary-foreground");
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(pressed ? 0.94 : state.listening ? 1.08 : 1, {
      damping: 16,
      stiffness: 260,
      reduceMotion: ReduceMotion.System,
    });
  }, [scale, pressed, state.listening]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          state.mode === "hands-free" ? "Stop listening" : "Microphone"
        }
        accessibilityHint={
          compact
            ? "Speak a quick edit at the cursor."
            : "Hold to talk and release to send. Double-tap for hands-free."
        }
        accessibilityState={{
          busy: state.connection === "connecting",
          selected: state.listening,
        }}
        accessibilityActions={[
          { name: "start-voice", label: "Start hands-free conversation" },
          { name: "stop-voice", label: "Stop listening" },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "start-voice") {
            if (compact) conversation.startInline();
            else conversation.startHandsFree();
          }
          if (nativeEvent.actionName === "stop-voice") conversation.pause();
        }}
        delayLongPress={300}
        onTouchStart={conversation.onTouchStart}
        onPressIn={conversation.onTouchStart}
        onLongPress={compact ? undefined : conversation.onLongPress}
        onPressOut={conversation.onPressOut}
        onTouchEnd={conversation.onTouchEnd}
        onTouchCancel={conversation.onTouchCancel}
        onPress={compact ? conversation.startInline : conversation.onPress}
        className={cn(
          "shrink-0 items-center justify-center rounded-full",
          compact
            ? "size-11 mx-1 bg-transparent"
            : "size-14 bg-primary active:bg-primary/90",
        )}
      >
        <View pointerEvents="none">
          {state.connection === "connecting" ? (
            <ActivityIndicator
              color={compact ? foreground : primaryForeground}
            />
          ) : (
            <Icon
              family="Feather"
              name={state.mode === "hands-free" ? "square" : "mic"}
              size={24}
              accessible={false}
              className={cn(
                compact ? "text-foreground" : "text-primary-foreground",
              )}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};
