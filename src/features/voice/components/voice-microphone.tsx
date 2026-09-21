import { useEffect } from "react";
import { ActivityIndicator, Pressable } from "react-native";
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
}: {
  conversation: VoiceConversation;
}) => {
  const { state } = conversation;
  const foreground = useThemeColor("primary-foreground");
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(state.listening ? 1.08 : 1, {
      damping: 16,
      stiffness: 260,
      reduceMotion: ReduceMotion.System,
    });
  }, [scale, state.listening]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          state.mode === "hands-free" ? "Stop voice conversation" : "Microphone"
        }
        accessibilityHint="Hold to talk and release to send. Double-tap for hands-free."
        accessibilityState={{
          busy: state.connection === "connecting",
          selected: state.listening,
        }}
        accessibilityActions={[
          { name: "start-voice", label: "Start hands-free conversation" },
          { name: "stop-voice", label: "Stop voice conversation" },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "start-voice")
            conversation.startHandsFree();
          if (nativeEvent.actionName === "stop-voice") conversation.stop();
        }}
        delayLongPress={300}
        onPressIn={conversation.onPressIn}
        onLongPress={conversation.onLongPress}
        onPressOut={conversation.onPressOut}
        onTouchCancel={conversation.onTouchCancel}
        onPress={conversation.onPress}
        className={cn(
          "size-14 shrink-0 items-center justify-center rounded-full bg-primary active:bg-primary/90",
          state.listening && "border-2 border-primary-foreground",
        )}
      >
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
      </Pressable>
    </Animated.View>
  );
};
