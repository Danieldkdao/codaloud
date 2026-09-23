import type { Ref } from "react";
import {
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ScrollFade } from "./scroll-fade";

type ScrollFadeScrollViewProps = ScrollViewProps & {
  ref?: Ref<ScrollView>;
  containerStyle?: StyleProp<ViewStyle>;
};

export const ScrollFadeScrollView = ({
  containerStyle,
  onLayout,
  onContentSizeChange,
  onScroll,
  ...props
}: ScrollFadeScrollViewProps) => {
  return (
    <ScrollFade
      containerStyle={[{ borderRadius: 12 }, containerStyle]}
      onLayout={onLayout}
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll}
    >
      {(handlers) => (
        <ScrollView {...props} {...handlers} scrollEventThrottle={16} />
      )}
    </ScrollFade>
  );
};
