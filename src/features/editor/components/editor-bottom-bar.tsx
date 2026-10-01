import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, useWindowDimensions, type KeyboardMetrics } from "react-native";
import { useKeyboardSymbolsInset } from "@/hooks/use-keyboard-symbols";
import { useCommandBubbleAnchor } from "@/features/voice/hooks/use-command-bubble-layout";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

export const EditorBottomBar = ({
  children,
  frame,
  dockHeight,
  onHeight,
  commandScope,
}: {
  children: ReactNode;
  frame?: KeyboardMetrics;
  dockHeight: number;
  onHeight: (height: number) => void;
  commandScope?: string;
}) => {
  const viewport = useRef<View>(null);
  const symbolInset = useKeyboardSymbolsInset();
  const currentFrame = useRef(frame);
  currentFrame.current = frame;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const { width, height } = useWindowDimensions();
  const anchor = useCommandBubbleAnchor(commandScope);
  const measure = useCallback(() => {
    if (!frame) {
      setKeyboardInset(0);
      return;
    }
    viewport.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (currentFrame.current === frame)
        setKeyboardInset(Math.max(0, y + measuredHeight - frame.screenY));
    });
  }, [frame]);
  useEffect(measure, [measure, width, height]);
  return (
    <View
      ref={viewport}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={measure}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Never animate ancestor opacity: UIKit can permanently drop its glass effect. */}
      <Animated.View
        ref={anchor.ref}
        collapsable={false}
        testID="editor-bottom-bar"
        layout={LinearTransition.duration(220).reduceMotion(
          ReduceMotion.System,
        )}
        className="absolute left-4 right-4"
        style={{
          bottom:
            (frame ? keyboardInset + symbolInset : dockHeight) +
            (frame ? 16 : 8),
        }}
        onLayout={({ nativeEvent }) => {
          onHeight(nativeEvent.layout.height);
          anchor.onLayout();
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
};
