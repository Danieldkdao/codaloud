import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
import { formatVoiceStatus } from "../lib/formatters";

export const VoiceTranscriptBubble = ({
  conversation,
}: {
  conversation: VoiceConversation;
}) => {
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const reviewing = useRef(false);
  const [showLatest, setShowLatest] = useState(false);
  const { state } = conversation;
  useEffect(() => {
    if (!conversation.visible || state.connection === "connecting") {
      follow.current = true;
      reviewing.current = false;
      setShowLatest(false);
    }
  }, [conversation.visible, state.connection]);
  if (!conversation.visible) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(180).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}
      style={{
        alignSelf: "center",
        width: Math.min(width - 32, 420),
        paddingBottom: 8,
      }}
    >
      <GlassSurface borderRadius={28}>
        <View className="p-4">
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                "size-2 rounded-full bg-muted-foreground",
                state.listening && "bg-primary",
              )}
            />
            <PText
              className="flex-1 text-foreground font-sans-medium"
              accessibilityLiveRegion="polite"
            >
              {formatVoiceStatus(state)}
            </PText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close voice conversation"
              onPress={conversation.stop}
              className="size-11 items-center justify-center rounded-full active:bg-muted"
            >
              <Icon
                family="Feather"
                name="x"
                size={20}
                className="text-muted-foreground"
              />
            </Pressable>
          </View>
          <ScrollView
            ref={scroll}
            style={{ maxHeight: Math.min(240, height * 0.28) }}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            onScrollBeginDrag={() => {
              reviewing.current = true;
              follow.current = false;
            }}
            onScrollEndDrag={() => {
              reviewing.current = false;
            }}
            onMomentumScrollBegin={() => {
              reviewing.current = true;
            }}
            onMomentumScrollEnd={() => {
              reviewing.current = false;
            }}
            onScroll={({
              nativeEvent: { contentOffset, contentSize, layoutMeasurement },
            }) => {
              if (!reviewing.current) return;
              follow.current =
                contentSize.height -
                  layoutMeasurement.height -
                  contentOffset.y <
                40;
              setShowLatest(!follow.current);
            }}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (follow.current)
                scroll.current?.scrollToEnd({ animated: true });
            }}
            onLayout={() => {
              if (follow.current)
                scroll.current?.scrollToEnd({ animated: false });
            }}
          >
            {state.error ? (
              <PText className="pb-2 text-destructive">{state.error}</PText>
            ) : null}
            {state.transcript.length === 0 && !state.error ? (
              <PText className="pb-2">
                {state.connection === "connecting"
                  ? state.mode === "hold"
                    ? "Getting ready. Keep holding, or release to cancel."
                    : "Getting ready. Tap the microphone to cancel."
                  : "Your words and the AI’s reply appear here as you speak."}
              </PText>
            ) : null}
            {state.transcript.map((segment) => (
              <Animated.View
                key={segment.id}
                entering={FadeIn.duration(180).reduceMotion(
                  ReduceMotion.System,
                )}
                layout={LinearTransition.duration(120).reduceMotion(
                  ReduceMotion.System,
                )}
                className="mb-3"
              >
                <PText
                  className={cn(
                    "font-sans-medium",
                    segment.role === "assistant" && "text-primary",
                  )}
                >
                  {segment.role === "user" ? "You" : "Codaloud"}
                </PText>
                <PText selectable className="text-foreground">
                  {segment.text}
                  {segment.final ? "" : " ▍"}
                </PText>
              </Animated.View>
            ))}
          </ScrollView>
          {showLatest ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                follow.current = true;
                setShowLatest(false);
                scroll.current?.scrollToEnd({ animated: true });
              }}
              className="min-h-11 items-center justify-center rounded-full bg-muted"
            >
              <PText className="text-foreground">Jump to latest</PText>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>
    </Animated.View>
  );
};
