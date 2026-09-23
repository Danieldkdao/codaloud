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
  const foreground = useThemeColor("primary-foreground");
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
        accessibilityHint="Hold to talk and release to send. Double-tap for hands-free."
        accessibilityState={{
          busy: state.connection === "connecting",
          selected: state.listening,
        }}
        accessibilityActions={[
          { name: "start-voice", label: "Start hands-free conversation" },
          { name: "stop-voice", label: "Stop listening" },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "start-voice")
            conversation.startHandsFree();
          if (nativeEvent.actionName === "stop-voice") conversation.pause();
        }}
        delayLongPress={300}
        onTouchStart={conversation.onTouchStart}
        onPressIn={conversation.onTouchStart}
        onLongPress={conversation.onLongPress}
        onPressOut={conversation.onPressOut}
        onTouchEnd={conversation.onTouchEnd}
        onTouchCancel={conversation.onTouchCancel}
        onPress={conversation.onPress}
        className={cn(
          "shrink-0 items-center justify-center rounded-full bg-primary active:bg-primary/90",
          compact ? "size-11 mx-1" : "size-14",
          (pressed || state.listening) && "border-2 border-primary-foreground",
        )}
      >
        <View pointerEvents="none">
          {state.connection === "connecting" ? (
            <ActivityIndicator color={foreground} />
          ) : (
            <Icon
              family="Feather"
              name={state.mode === "hands-free" ? "square" : "mic"}
              size={24}
              accessible={false}
              className="text-primary-foreground"
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};
