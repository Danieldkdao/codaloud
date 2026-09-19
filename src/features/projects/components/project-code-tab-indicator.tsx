import { View, type LayoutRectangle } from "react-native";
import Animated, { LinearTransition, ReduceMotion } from "react-native-reanimated";
import { GlassSurface } from "@/components/ui/glass-surface";

const selectionTransition = LinearTransition.springify()
  .duration(360)
  .dampingRatio(1)
  .reduceMotion(ReduceMotion.System);

export const ProjectCodeTabIndicator = ({ frame }: { frame: LayoutRectangle }) => (
  <Animated.View
    testID="code-tab-indicator"
    pointerEvents="none"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    layout={selectionTransition}
    style={{
      position: "absolute",
      left: frame.x,
      top: frame.y,
      width: frame.width,
      height: frame.height,
    }}
  >
    <GlassSurface borderRadius={24} shadow={false}>
      <View style={{ height: frame.height }} />
    </GlassSurface>
  </Animated.View>
);
