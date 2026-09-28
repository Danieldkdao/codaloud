import {
  ReduceMotion,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type LayoutAnimation,
} from "react-native-reanimated";

// GlassView cannot render reliably beneath an ancestor animated from opacity 0.
// Move and reshape the surface instead; only its text children may fade.
export const enterGlassSurface = (
  values: EntryAnimationsValues,
): LayoutAnimation => {
  "worklet";
  const spring = {
    damping: 18,
    stiffness: 260,
    mass: 0.8,
    reduceMotion: ReduceMotion.System,
  };
  return {
    initialValues: {
      transform: [
        // Offset the compressed height so it expands upward from its bottom edge.
        { translateY: values.targetHeight * 0.34 + 8 },
        { scaleX: 0.72 },
        { scaleY: 0.32 },
      ],
    },
    animations: {
      transform: [
        { translateY: withSpring(0, spring) },
        { scaleX: withSpring(1, spring) },
        { scaleY: withSpring(1, spring) },
      ],
    },
  };
};

export const exitGlassSurface = (
  values: ExitAnimationsValues,
): LayoutAnimation => {
  "worklet";
  const timing = { duration: 180, reduceMotion: ReduceMotion.System };
  return {
    initialValues: {
      transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }],
    },
    animations: {
      transform: [
        { translateY: withTiming(values.currentHeight * 0.48 + 8, timing) },
        { scaleX: withTiming(0.2, timing) },
        { scaleY: withTiming(0.04, timing) },
      ],
    },
  };
};
