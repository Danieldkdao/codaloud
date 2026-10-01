import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { useKeyboardSymbolsAccessoryHeight } from "@/hooks/use-keyboard-symbols";
import { useCommandBubbleControlsTop } from "../hooks/use-command-bubble-layout";

export const VoiceCommandOverlay = ({
  scope,
  children,
}: {
  scope: string;
  children: (maxHeight: number) => ReactNode;
}) => {
  const controlsTop = useCommandBubbleControlsTop(scope);
  const frame = useKeyboardFrame();
  const symbolInset = useKeyboardSymbolsAccessoryHeight();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [viewport, setViewport] = useState({ top: 0, bottom: height });
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, top, _width, measuredHeight) => {
      if (!ref.current || measuredHeight <= 0) return;
      setViewport((previous) =>
        previous.top === top && previous.bottom === top + measuredHeight
          ? previous
          : { top, bottom: top + measuredHeight },
      );
    });
  }, []);
  useEffect(measure, [measure, width, height, frame]);
  const bottomEdge = Math.min(
    controlsTop ?? viewport.bottom - Math.max(insets.bottom, 12) - 88,
    frame ? frame.screenY - symbolInset : viewport.bottom,
  );
  const maxHeight = Math.max(
    80,
    bottomEdge - Math.max(viewport.top, insets.top + 56) - 88,
  );
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={measure}
      pointerEvents="box-none"
      style={{ position: "absolute", inset: 0, zIndex: 100, elevation: 100 }}
    >
      <Animated.View
        testID="voice-command-overlay"
        pointerEvents="box-none"
        layout={LinearTransition.duration(220).reduceMotion(
          ReduceMotion.System,
        )}
        style={{
          position: "absolute",
          bottom: Math.max(0, viewport.bottom - bottomEdge) + 8,
          left: 0,
          right: 0,
        }}
      >
        {children(maxHeight)}
      </Animated.View>
    </View>
  );
};
