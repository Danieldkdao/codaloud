import { MarkdownText } from "@/components/markdown-text";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { cn } from "@/lib/utils";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeIn,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
import { formatVoiceStatus, formatVoiceTranscript } from "../lib/formatters";

import { microphoneTrack } from "@/services/livekit/voice-track";
import { inlineSession } from "../inline-session";
const FileActivity = lazy(async () => ({
  default: (await import("@/features/agent/components/file-activity"))
    .FileActivity,
}));

// Evaluate the native SDK only after a real microphone track exists.
const VoiceFrequencyBars = lazy(() => import("./voice-frequency-bars"));

const revealContent = FadeIn.duration(220).reduceMotion(ReduceMotion.System);

export const VoiceTranscriptBubble = ({
  conversation,
  compact = false,
}: {
  conversation: VoiceConversation;
  compact?: boolean;
}) => {
  const track = useSyncExternalStore(
    microphoneTrack.subscribe,
    microphoneTrack.getSnapshot,
  );
  const inline = useSyncExternalStore(
    inlineSession.subscribe,
    inlineSession.getSnapshot,
  );
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const reviewing = useRef(false);
  const [showLatest, setShowLatest] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentStyle = useAnimatedStyle(() => ({
    height:
      contentHeight === null
        ? undefined
        : withSpring(collapsed ? 0 : contentHeight, {
            damping: 26,
            stiffness: 280,
            overshootClamping: true,
            reduceMotion: ReduceMotion.System,
          }),
    opacity: withTiming(collapsed ? 0 : 1, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    }),
  }));
  const { state } = conversation;
  useEffect(() => {
    if (!conversation.visible || state.connection === "connecting") {
      follow.current = true;
      reviewing.current = false;
      setShowLatest(false);
      setCollapsed(false);
    }
  }, [conversation.visible, state.connection]);
  if (!conversation.visible) return null;
  return (
    <Animated.View
      entering={enterGlassSurface}
      exiting={exitGlassSurface}
      style={{
        alignSelf: "center",
        width: Math.min(width - 32, 420),
        paddingBottom: 8,
      }}
    >
      <GlassSurface borderRadius={28}>
        <Animated.View entering={revealContent} className="px-4 py-2">
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                "size-2 rounded-full bg-muted-foreground",
                state.listening && "bg-primary",
              )}
            />
            <PText
              className="min-w-0 flex-1 text-foreground font-medium"
              numberOfLines={2}
              accessibilityLiveRegion="polite"
            >
              {inline?.status === "generating"
                ? "Writing suggestion…"
                : inline?.status === "ready"
                  ? "Review suggestion in editor"
                  : formatVoiceStatus(state)}
            </PText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                collapsed ? "Expand transcript" : "Collapse transcript"
              }
              accessibilityState={{ expanded: !collapsed }}
              onPress={() => {
                reviewing.current = false;
                follow.current = true;
                setShowLatest(false);
                setCollapsed((value) => !value);
              }}
              className="size-12 shrink-0 items-center justify-center rounded-full active:bg-muted"
            >
              <Icon
                family="Feather"
                name={collapsed ? "chevron-up" : "chevron-down"}
                size={24}
                className="text-muted-foreground"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close voice conversation"
              onPress={conversation.stop}
              className="size-12 shrink-0 items-center justify-center rounded-full active:bg-muted"
            >
              <Icon
                family="Feather"
                name="x"
                size={20}
                className="text-muted-foreground"
              />
            </Pressable>
          </View>
          <Animated.View
            testID="voice-transcript-viewport"
            style={[{ overflow: "hidden" }, contentStyle]}
            pointerEvents={collapsed ? "none" : "auto"}
            accessibilityElementsHidden={collapsed}
            importantForAccessibility={
              collapsed ? "no-hide-descendants" : "auto"
            }
          >
            <View
              testID="voice-transcript-content"
              className="pb-2"
              // Measure unconstrained content, even while its viewport is closed.
              // Animating actual height keeps the native glass background in sync.
              style={
                contentHeight === null
                  ? undefined
                  : {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                    }
              }
              onLayout={({ nativeEvent: { layout } }) =>
                setContentHeight(layout.height)
              }
            >
              {state.listening && track ? (
                <Suspense fallback={null}>
                  <VoiceFrequencyBars track={track} />
                </Suspense>
              ) : null}
              <ScrollView
                ref={scroll}
                style={{
                  maxHeight: compact
                    ? Math.min(120, height * 0.16)
                    : Math.min(240, height * 0.28),
                }}
                keyboardShouldPersistTaps="always"
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
                  // scrollToEnd also emits momentum events; only a user drag
                  // may opt out of following the latest transcript.
                  reviewing.current = !follow.current;
                }}
                onMomentumScrollEnd={() => {
                  reviewing.current = false;
                }}
                onScroll={({
                  nativeEvent: {
                    contentOffset,
                    contentSize,
                    layoutMeasurement,
                  },
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
                {inline?.toolActivity ? (
                  <PText
                    accessibilityLiveRegion="polite"
                    className="pb-2 text-muted-foreground"
                  >
                    {inline.toolActivity}
                  </PText>
                ) : null}
                {inline?.files?.length ? (
                  <Suspense fallback={null}>
                    <FileActivity
                      projectId={inline.projectId}
                      files={inline.files}
                    />
                  </Suspense>
                ) : null}
                {state.transcript.length === 0 && !state.error ? (
                  <PText className="pb-2">
                    {state.connection === "connecting"
                      ? state.mode === "hold"
                        ? "Getting ready. Keep holding, or release to cancel."
                        : "Getting ready. Tap the microphone to cancel."
                      : "Your words and the Codaloud’s reply appear here as you speak."}
                  </PText>
                ) : null}
                {formatVoiceTranscript(state.transcript).map((segment) => (
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
                        "font-medium",
                        segment.role === "assistant" && "text-primary",
                      )}
                    >
                      {segment.role === "user" ? "You" : "Codaloud"}
                    </PText>
                    <MarkdownText
                      text={segment.text}
                      streaming={!segment.final}
                    />
                  </Animated.View>
                ))}
                {state.error ? (
                  <PText selectable className="pb-2 text-destructive">
                    {state.error}
                  </PText>
                ) : null}
                {inline?.error ? (
                  <PText className="pb-2 text-destructive">
                    {inline.error}
                  </PText>
                ) : null}
                {inline &&
                ["listening", "generating", "ready", "error"].includes(
                  inline.status,
                ) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel current request"
                    onPress={() => inlineSession.cancel()}
                    className="min-h-11 items-center justify-center rounded-full bg-muted"
                  >
                    <PText>Cancel request</PText>
                  </Pressable>
                ) : null}
              </ScrollView>
              {showLatest ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    reviewing.current = false;
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
          </Animated.View>
        </Animated.View>
      </GlassSurface>
    </Animated.View>
  );
};
