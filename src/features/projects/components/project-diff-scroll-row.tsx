import { useCallback, useEffect, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import Animated, { scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, type SharedValue } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

export type ProjectDiffScrollState = SharedValue<{ x: number; owner: string }>;

type ProjectDiffScrollRowProps = {
  scroll: ProjectDiffScrollState;
  rowKey: string;
  contentWidth: number;
  viewportWidth: number;
  children: ReactNode;
};

export const ProjectDiffScrollRow = ({ scroll, rowKey, contentWidth, viewportWidth, children }: ProjectDiffScrollRowProps) => {
  const ref = useAnimatedRef<ScrollView>();
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scroll.value = { x: scroll.value.x, owner: rowKey };
    },
    onScroll: (event) => {
      // Only the touched row drives the file. Ignore scroll events emitted by
      // synchronized peers, and let the active row continue driving momentum.
      if (scroll.value.owner === rowKey && scroll.value.x !== event.contentOffset.x) {
        scroll.value = { x: event.contentOffset.x, owner: rowKey };
      }
    },
  });
  useAnimatedReaction(
    () => scroll.value,
    (position) => {
      if (position.owner !== rowKey) scrollTo(ref, position.x, 0, false);
    },
  );
  const restoreOffset = useCallback(() => {
    "worklet";
    const position = scroll.value;
    const x = Math.min(Math.max(0, position.x), Math.max(0, contentWidth - viewportWidth));
    if (x !== position.x) scroll.value = { x, owner: "" };
    scrollTo(ref, x, 0, false);
  }, [contentWidth, viewportWidth, ref, scroll]);
  useEffect(() => { scheduleOnUI(restoreOffset); }, [restoreOffset]);

  return (
    <Animated.ScrollView
      ref={ref}
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onContentSizeChange={() => scheduleOnUI(restoreOffset)}
    >
      <View style={{ width: contentWidth }}>{children}</View>
    </Animated.ScrollView>
  );
};
