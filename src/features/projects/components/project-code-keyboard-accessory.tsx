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
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { CodeText } from "@/components/ui/text";

const symbols = [
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "<",
  ">",
  ".",
  ":",
  ";",
  "'",
  '"',
  "=",
  "#",
  "_",
] as const;
const formatSymbolLabel = (symbol: string) => {
  switch (symbol) {
    case "'":
      return "Apostrophe";
    case '"':
      return "Double quote";
    default:
      return `Insert ${symbol}`;
  }
};

type ProjectCodeKeyboardAccessoryProps = {
  frame?: KeyboardMetrics;
  children?: ReactNode;
  onDismissKeyboard: () => void;
};

export const ProjectCodeKeyboardAccessory = ({
  frame,
  children,
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
        <View
          testID="editor-keyboard-strip"
          style={{ position: "absolute", left: 0, right: 0, bottom }}
        >
          <GlassSurface borderRadius={0}>
            <View
              testID="editor-keyboard-actions"
              className="h-12 flex-row items-center border-b border-border"
              style={{ paddingLeft: insets.left, paddingRight: insets.right }}
            >
              {children}
              <View className="flex-1" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy current line"
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
            <ScrollView
              testID="editor-keyboard-symbols"
              horizontal
              accessibilityLabel="Code symbols"
              accessibilityHint="Swipe horizontally for more symbols"
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              style={{ height: 48, flexGrow: 0 }}
              contentContainerStyle={{
                alignItems: "center",
                paddingLeft: insets.left,
                paddingRight: insets.right,
              }}
            >
              {/* Editing handlers are deliberately absent in this UI preview. */}
              {symbols.map((symbol) => (
                <Pressable
                  key={symbol}
                  accessibilityRole="button"
                  accessibilityLabel={formatSymbolLabel(symbol)}
                  className="h-12 w-11 items-center justify-center active:opacity-50"
                >
                  <CodeText className="text-xl text-foreground">
                    {symbol}
                  </CodeText>
                </Pressable>
              ))}
            </ScrollView>
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
};
