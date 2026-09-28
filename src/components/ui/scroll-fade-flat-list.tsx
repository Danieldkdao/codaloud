import {
  FlatList,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ScrollFade } from "./scroll-fade";

type ScrollFadeFlatListProps<Item> = FlatListProps<Item> & {
  containerStyle?: StyleProp<ViewStyle>;
};

export const ScrollFadeFlatList = <Item,>({
  containerStyle,
  onLayout,
  onContentSizeChange,
  onScroll,
  ...props
}: ScrollFadeFlatListProps<Item>) => (
  <ScrollFade
    containerStyle={[{ flex: 1 }, containerStyle]}
    onLayout={onLayout}
    onContentSizeChange={onContentSizeChange}
    onScroll={onScroll}
  >
    {(handlers) => (
      <FlatList {...props} {...handlers} scrollEventThrottle={16} />
    )}
  </ScrollFade>
);
