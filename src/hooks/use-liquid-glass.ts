import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Stay opaque until accessibility preferences are known. */
export const useLiquidGlass = () => {
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (enabled) => {
        changed = true;
        if (active) setReduceTransparency(enabled);
      },
    );
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        // A delayed initial lookup must not overwrite a newer accessibility event.
        if (active && !changed) setReduceTransparency(enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    !reduceTransparency &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable()
  );
};
