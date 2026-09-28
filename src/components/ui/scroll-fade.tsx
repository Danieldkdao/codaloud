import { useId, useRef, useState, type ReactNode } from "react";
import {
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import MaskedView from "@react-native-masked-view/masked-view";

const fadeHeight = 32;
// Mask RGB is never displayed: only alpha controls content visibility.
const maskColor = "black";

type ScrollFadeProps = Pick<
  ScrollViewProps,
  "onLayout" | "onContentSizeChange" | "onScroll"
> & {
  children: (
    handlers: Required<
      Pick<ScrollViewProps, "onLayout" | "onContentSizeChange" | "onScroll">
    >,
  ) => ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Fade content alpha, revealing any surface behind the scrolling viewport. */
export const ScrollFade = ({
  containerStyle,
  onLayout,
  onContentSizeChange,
  onScroll,
  children,
}: ScrollFadeProps) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });
  const [fades, setFades] = useState({ top: 0, bottom: 0, edge: 0 });
  const updateFades = () => {
    const { viewport, content, offset } = metrics.current;
    const maxOffset = Math.max(0, content - viewport);
    const clampedOffset = Math.max(0, Math.min(offset, maxOffset));
    const top = viewport > 0 ? Math.min(1, clampedOffset / fadeHeight) : 0;
    const bottom =
      viewport > 0 ? Math.min(1, (maxOffset - clampedOffset) / fadeHeight) : 0;
    const edge = viewport > 0 ? Math.min(0.5, fadeHeight / viewport) : 0;
    // Avoid rerendering rows on every scroll event away from the boundaries.
    setFades((previous) =>
      previous.top === top &&
      previous.bottom === bottom &&
      previous.edge === edge
        ? previous
        : { top, bottom, edge },
    );
  };

  return (
    <MaskedView
      style={[{ minHeight: 0, overflow: "hidden" }, containerStyle]}
      // Android's hardware mode caches masks; scroll-driven alpha needs updates.
      androidRenderingMode="software"
      maskElement={
        <View
          testID="scroll-fade-mask"
          style={{ flex: 1 }}
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0%"
                  stopColor={maskColor}
                  stopOpacity={1 - fades.top}
                />
                <Stop
                  offset={`${fades.edge * 100}%`}
                  stopColor={maskColor}
                  stopOpacity={1}
                />
                <Stop
                  offset={`${(1 - fades.edge) * 100}%`}
                  stopColor={maskColor}
                  stopOpacity={1}
                />
                <Stop
                  offset="100%"
                  stopColor={maskColor}
                  stopOpacity={1 - fades.bottom}
                />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </View>
      }
    >
      {children({
        onLayout: (event) => {
          metrics.current.viewport = event.nativeEvent.layout.height;
          updateFades();
          onLayout?.(event);
        },
        onContentSizeChange: (width, height) => {
          metrics.current.content = height;
          updateFades();
          onContentSizeChange?.(width, height);
        },
        onScroll: (event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          metrics.current = {
            offset: contentOffset.y,
            content: contentSize.height,
            viewport: layoutMeasurement.height,
          };
          updateFades();
          onScroll?.(event);
        },
      })}
    </MaskedView>
  );
};
