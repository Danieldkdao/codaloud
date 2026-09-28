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
import {
  PanResponder,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
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

// The shortest a drag will go. Full minimize hides the transcript and is only
// reachable through the minimize button, so a drag never strands the user.
const DRAG_MIN_HEIGHT = 120;
const slideEasing = Easing.inOut(Easing.cubic);
const slideMs = 300;

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
  // Only a real touch may pause following; a drag that never scrolls must leave
  // the decision to onScroll, or the tail stops following with no way back.
  const userGesture = useRef(false);
  const userScrolling = useRef(false);
  const [showLatest, setShowLatest] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // One animated height that the drag handle, minimize button and content growth
  // all write to, so every resize slides; the ScrollView fills it and scrolls.
  const viewportHeight = useSharedValue(0);
  const sized = useRef(false);
  const contentHeight = useRef(0);
  const dragFrom = useRef(0);
  const maxHeight = compact
    ? Math.min(160, height * 0.22)
    : Math.min(420, height * 0.45);
  const clampHeight = (value: number) =>
    Math.max(DRAG_MIN_HEIGHT, Math.min(maxHeight, value));
  const autoHeight = () => clampHeight(contentHeight.current);
  const slideTo = (value: number) => {
    viewportHeight.value = withTiming(value, {
      duration: slideMs,
      easing: slideEasing,
      reduceMotion: ReduceMotion.System,
    });
  };
  const viewportStyle = useAnimatedStyle(() => ({
    height: viewportHeight.value,
    opacity: withTiming(viewportHeight.value > 8 ? 1 : 0, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    }),
  }));
  const resizeHandle = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragFrom.current = viewportHeight.value;
    },
    onPanResponderMove: (_event, gesture) => {
      sized.current = true;
      viewportHeight.value = clampHeight(dragFrom.current - gesture.dy);
    },
  });
  const { state } = conversation;
  useEffect(() => {
    if (!conversation.visible || state.connection === "connecting") {
      follow.current = true;
      userGesture.current = false;
      userScrolling.current = false;
      sized.current = false;
      viewportHeight.value = 0;
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
                userGesture.current = false;
                userScrolling.current = false;
                follow.current = true;
                setShowLatest(false);
                const next = !collapsed;
                setCollapsed(next);
                if (next) {
                  slideTo(0);
                } else {
                  sized.current = false;
                  slideTo(autoHeight());
                }
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
            style={[{ overflow: "hidden" }, viewportStyle]}
            pointerEvents={collapsed ? "none" : "auto"}
            accessibilityElementsHidden={collapsed}
            importantForAccessibility={
              collapsed ? "no-hide-descendants" : "auto"
            }
          >
            <View
              testID="voice-transcript-content"
              className="pb-2"
              style={{ flex: 1 }}
            >
              <View
                testID="voice-transcript-handle"
                {...resizeHandle.panHandlers}
                accessibilityRole="adjustable"
                accessibilityLabel="Drag to resize transcript"
                className="items-center py-1"
              >
                <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
              </View>
              {state.listening && track ? (
                <Suspense fallback={null}>
                  <VoiceFrequencyBars track={track} />
                </Suspense>
              ) : null}
              <ScrollView
                ref={scroll}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator
                nestedScrollEnabled
                onScrollBeginDrag={() => {
                  userGesture.current = true;
                  userScrolling.current = true;
                }}
                onScrollEndDrag={() => {
                  userScrolling.current = false;
                }}
                onMomentumScrollBegin={() => {
                  // scrollToEnd also emits momentum events; only a user drag
                  // may opt out of following the latest transcript.
                  userScrolling.current = userGesture.current;
                }}
                onMomentumScrollEnd={() => {
                  userGesture.current = false;
                  userScrolling.current = false;
                }}
                onScroll={({
                  nativeEvent: {
                    contentOffset,
                    contentSize,
                    layoutMeasurement,
                  },
                }) => {
                  const atBottom =
                    contentSize.height -
                      layoutMeasurement.height -
                      contentOffset.y <
                    40;
                  // Automatic scrolling emits intermediate offsets, so reaching
                  // the bottom re-arms following even when no finger is down.
                  if (userScrolling.current || atBottom)
                    follow.current = atBottom;
                  setShowLatest(!follow.current);
                }}
                scrollEventThrottle={32}
                onContentSizeChange={(_w, content) => {
                  contentHeight.current = content;
                  // Growth follows the reply until the user takes over with the
                  // handle; after that their chosen height wins.
                  if (!collapsed && !sized.current && Number.isFinite(content))
                    slideTo(clampHeight(content));
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
                      className="pb-2"
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
                {state.transcriptWarning ? (
                  <PText
                    accessibilityLiveRegion="polite"
                    className="pb-2 text-muted-foreground"
                  >
                    {state.transcriptWarning}
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
                    userGesture.current = false;
                    userScrolling.current = false;
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
