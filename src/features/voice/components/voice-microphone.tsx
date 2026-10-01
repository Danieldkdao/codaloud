import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { commandCenter } from "../command-center";

export const VoiceMicrophone = ({
  conversation,
  compact = false,
  liquidGlass = false,
  projectId,
  textMode: overrideTextMode,
  launcher = false,
  quickEdit = compact,
}: {
  conversation: VoiceConversation;
  compact?: boolean;
  liquidGlass?: boolean;
  projectId?: string;
  textMode?: boolean;
  launcher?: boolean;
  quickEdit?: boolean;
}) => {
  const { preferences } = useEditorPreferences();
  const textMode = overrideTextMode ?? preferences.textMode;
  const openText = () => {
    if (quickEdit) conversation.showInline();
    else if (conversation.state.listening) conversation.pause();
    commandCenter.open(
      projectId ?? conversation.projectId ?? "app",
      quickEdit ? "quick-edit" : "agent",
    );
  };
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
  const button = (
    <Pressable
      testID={launcher ? "voice-command-launcher" : "voice-microphone"}
      accessibilityRole="button"
      accessibilityLabel={
        textMode
          ? quickEdit
            ? "Type a quick edit"
            : "Type a command"
          : state.mode === "hands-free"
            ? "Stop listening"
            : "Microphone"
      }
      accessibilityHint={
        textMode
          ? "Open the text command input without starting an audio session."
          : quickEdit
            ? "Speak a quick edit at the cursor."
            : "Hold to talk and release to send. Double-tap for hands-free."
      }
      accessibilityState={{
        busy: state.connection === "connecting",
        selected: state.listening,
      }}
      accessibilityActions={
        textMode
          ? [
              {
                name: "type-command",
                label: quickEdit ? "Type a quick edit" : "Type a command",
              },
            ]
          : [
              { name: "start-voice", label: "Start hands-free conversation" },
              { name: "stop-voice", label: "Stop listening" },
            ]
      }
      onAccessibilityAction={({ nativeEvent }) => {
        if (textMode) {
          openText();
          return;
        }
        if (nativeEvent.actionName === "start-voice") {
          if (quickEdit) conversation.startInline();
          else conversation.startHandsFree();
        }
        if (nativeEvent.actionName === "stop-voice") conversation.pause();
      }}
      delayLongPress={300}
      onTouchStart={textMode ? undefined : conversation.onTouchStart}
      onPressIn={textMode ? undefined : conversation.onTouchStart}
      onLongPress={textMode || quickEdit ? undefined : conversation.onLongPress}
      onPressOut={textMode ? undefined : conversation.onPressOut}
      onTouchEnd={textMode ? undefined : conversation.onTouchEnd}
      onTouchCancel={textMode ? undefined : conversation.onTouchCancel}
      onPress={
        textMode
          ? openText
          : quickEdit
            ? state.listening || state.connection === "connecting"
              ? conversation.pause
              : conversation.startInline
            : conversation.onPress
      }
      className={cn(
        "shrink-0 items-center justify-center rounded-full",
        compact
          ? "size-11 mx-1 bg-transparent"
          : "size-14 bg-primary active:bg-primary/90",
      )}
    >
      <View pointerEvents="none">
        {textMode ? (
          <Icon
            family="Ionicons"
            name="sparkles-outline"
            size={24}
            className={cn(
              compact ? "text-foreground" : "text-primary-foreground",
            )}
          />
        ) : state.connection === "connecting" ? (
          <ActivityIndicator color={compact ? foreground : primaryForeground} />
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
  );
  return (
    <Animated.View style={animatedStyle}>
      {liquidGlass ? (
        <GlassSurface borderRadius={24}>{button}</GlassSurface>
      ) : (
        button
      )}
    </Animated.View>
  );
};
