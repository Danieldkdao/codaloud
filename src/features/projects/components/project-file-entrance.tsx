import { useMemo, type ReactNode } from "react";
import Animated, { Easing, FadeInUp, ReduceMotion } from "react-native-reanimated";

export const ProjectFileEntrance = ({ index, children }: { index: number; children: ReactNode }) => {
  const entering = useMemo(() => FadeInUp
    .duration(220)
    // Bound the waterfall so large lists never accumulate seconds of delay.
    .delay(Math.min(index, 8) * 18)
    .easing(Easing.out(Easing.quad))
    .withInitialValues({ opacity: 0, translateY: -6 })
    .reduceMotion(ReduceMotion.System), [index]);

  return <Animated.View entering={entering}>{children}</Animated.View>;
};
