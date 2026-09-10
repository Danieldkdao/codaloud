import { useId, useRef, useState } from "react";
import { FlatList, View, type FlatListProps, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useThemeColor } from "@/hooks/use-theme";

const fadeHeight = 32;

type ScrollFadeFlatListProps<Item> = FlatListProps<Item> & {
  containerStyle?: StyleProp<ViewStyle>;
};

/** Scroll-aware edge fades on a solid card surface. */
export const ScrollFadeFlatList = <Item,>({
  containerStyle, onLayout, onContentSizeChange, onScroll, ...props
}: ScrollFadeFlatListProps<Item>) => {
  const color = useThemeColor("card");
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });
  const [fades, setFades] = useState({ top: 0, bottom: 0 });
  const updateFades = () => {
    const { viewport, content, offset } = metrics.current;
    const maxOffset = Math.max(0, content - viewport);
    const clampedOffset = Math.max(0, Math.min(offset, maxOffset));
    const top = viewport > 0 ? Math.min(1, clampedOffset / fadeHeight) : 0;
    const bottom = viewport > 0 ? Math.min(1, (maxOffset - clampedOffset) / fadeHeight) : 0;
    // Avoid rerendering rows on every scroll event away from the boundaries.
    setFades((previous) => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
  };

  return (
    <View style={[{ flex: 1, minHeight: 0, overflow: "hidden" }, containerStyle]}>
      <FlatList
        {...props}
        scrollEventThrottle={16}
        onLayout={(event) => {
          metrics.current.viewport = event.nativeEvent.layout.height;
          updateFades();
          onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          metrics.current.content = height;
          updateFades();
          onContentSizeChange?.(width, height);
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          metrics.current = { offset: contentOffset.y, content: contentSize.height, viewport: layoutMeasurement.height };
          updateFades();
          onScroll?.(event);
        }}
      />
      {(["top", "bottom"] as const).map((edge) => (
        <View key={edge} testID={`scroll-fade-${edge}`} pointerEvents="none" aria-hidden
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", left: 0, right: 0, [edge]: 0, height: fadeHeight, opacity: fades[edge] }}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}-${edge}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={edge === "top" ? 1 : 0} />
                <Stop offset="1" stopColor={color} stopOpacity={edge === "top" ? 0 : 1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id}-${edge})`} />
          </Svg>
        </View>
      ))}
    </View>
  );
};
