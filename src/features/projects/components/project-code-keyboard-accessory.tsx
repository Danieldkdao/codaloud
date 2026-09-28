import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type KeyboardMetrics,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { KeyboardSymbols } from "@/components/keyboard-symbols";

import type {
  EditorCommand,
  EditorCommandState,
} from "@/features/editor/types";

type ProjectCodeKeyboardAccessoryProps = {
  onCommand?: (command: EditorCommand, text?: string) => void;
  canComment?: boolean;
  fold?: EditorCommandState["fold"];
  frame?: KeyboardMetrics;
  children?: ReactNode;
  voice?: ReactNode;
  feedback?: ReactNode;
  status?: ReactNode;
  voiceActive?: boolean;
  onHeight?: (height: number) => void;
  onDismissKeyboard: () => void;
};

const transition = LinearTransition.duration(280).reduceMotion(
  ReduceMotion.System,
);
const reveal = FadeIn.duration(220).reduceMotion(ReduceMotion.System);
const conceal = FadeOut.duration(160).reduceMotion(ReduceMotion.System);

const formatCursorFoldAction = (fold: EditorCommandState["fold"]) => {
  switch (fold) {
    case "unfold":
      return {
        label: "Unfold current line",
        icon: "unfold-more-horizontal" as const,
      };
    case "fold":
    case "unavailable":
      return {
        label: "Fold current line",
        icon: "unfold-less-horizontal" as const,
      };
  }
};

export const ProjectCodeKeyboardAccessory = ({
  frame,
  onCommand,
  canComment = true,
  fold = "unavailable",
  children,
  voice,
  feedback,
  status,
  voiceActive = false,
  onHeight,
  onDismissKeyboard,
}: ProjectCodeKeyboardAccessoryProps) => {
  const viewport = useRef<View>(null);
  const latestFrame = useRef(frame);
  latestFrame.current = frame;
  const [bottom, setBottom] = useState(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const measure = useCallback(() => {
    if (!frame) return;
    // Android may already have resized the native viewport, while iOS normally
    // overlays the keyboard. Measuring avoids applying the keyboard height twice.
    viewport.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (latestFrame.current === frame) {
        setBottom(Math.max(0, y + measuredHeight - frame.screenY));
      }
    });
  }, [frame]);
  useEffect(measure, [measure, width, height]);

  return (
    <View
      ref={viewport}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={measure}
      style={{ position: "absolute", inset: 0, zIndex: 20 }}
    >
      {frame ? (
        <Animated.View
          layout={transition}
          testID="editor-keyboard-strip"
          onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            left: 8 + insets.left,
            right: 8 + insets.right,
            bottom,
            gap: 6,
            paddingBottom: 4,
          }}
        >
          {!voiceActive && status ? (
            // Mount the toolbar's scroll-contained glass at full size. Scaling
            // its ancestor on entry can leave UIKit drawing only the icons.
            <Animated.View key="status" layout={transition}>
              {status}
            </Animated.View>
          ) : null}
          <Animated.View layout={transition}>
            <GlassSurface borderRadius={24}>
              {voiceActive ? (
                <Animated.View key="voice" entering={reveal} exiting={conceal}>
                  {feedback}
                </Animated.View>
              ) : (
                <Animated.View
                  key="actions"
                  entering={reveal}
                  exiting={conceal}
                >
                  <View
                    testID="editor-keyboard-actions"
                    className="h-12 flex-row items-center"
                  >
                    {voice}
                    <ScrollView
                      testID="editor-keyboard-action-scroll"
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="always"
                      accessibilityLabel="Editor actions"
                      accessibilityHint="Swipe horizontally for more actions"
                      style={{ flex: 1 }}
                      contentContainerStyle={{
                        flexGrow: 1,
                        alignItems: "center",
                      }}
                    >
                      {children}
                      <View className="flex-1" />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move cursor left"
                        onPress={() => onCommand?.("cursor-left")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="arrow-left"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move cursor right"
                        onPress={() => onCommand?.("cursor-right")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="arrow-right"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move cursor up"
                        onPress={() => onCommand?.("cursor-up")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="arrow-up"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Move cursor down"
                        onPress={() => onCommand?.("cursor-down")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="arrow-down"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={formatCursorFoldAction(fold).label}
                        disabled={fold === "unavailable"}
                        accessibilityState={{
                          disabled: fold === "unavailable",
                        }}
                        onPress={() => onCommand?.("fold")}
                        className="h-12 w-11 items-center justify-center active:opacity-50 disabled:opacity-40"
                      >
                        <Icon
                          family="MaterialCommunityIcons"
                          name={formatCursorFoldAction(fold).icon}
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Copy current line"
                        onPress={() => onCommand?.("copy-line")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="copy"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete current line"
                        onPress={() => onCommand?.("delete-line")}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="Feather"
                          name="trash-2"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Toggle comment"
                        onPress={() => onCommand?.("comment")}
                        disabled={!canComment}
                        accessibilityState={{ disabled: !canComment }}
                        className="h-12 w-11 items-center justify-center active:opacity-50"
                      >
                        <Icon
                          family="MaterialCommunityIcons"
                          name="comment-text-outline"
                          size={22}
                          className="text-foreground"
                          accessible={false}
                        />
                      </Pressable>
                    </ScrollView>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Hide keyboard"
                      onPress={onDismissKeyboard}
                      className="size-12 items-center justify-center active:opacity-50"
                    >
                      <Icon
                        family="MaterialCommunityIcons"
                        name="keyboard-close-outline"
                        size={24}
                        className="text-foreground"
                        accessible={false}
                      />
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </GlassSurface>
          </Animated.View>
          {!voiceActive ? (
            <Animated.View
              key="symbols"
              entering={enterGlassSurface}
              exiting={exitGlassSurface}
              layout={transition}
            >
              <GlassSurface borderRadius={24}>
                <KeyboardSymbols
                  testID="editor-keyboard-symbols"
                  onTab={() => onCommand?.("tab")}
                  onInsert={(symbol) => onCommand?.("insert", symbol)}
                />
              </GlassSurface>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
};
