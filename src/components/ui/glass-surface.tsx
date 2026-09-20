import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

type GlassSurfaceProps = {
  children: ReactNode;
  borderRadius?: number;
};

/** Native glass when available, with an opaque, accessible fallback. */
export const GlassSurface = ({
  children,
  borderRadius = 28,
}: GlassSurfaceProps) => {
  const [reduceTransparency, setReduceTransparency] = useState(true);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (active) setReduceTransparency(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const useGlass =
    !reduceTransparency &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();

  return (
    <View
      style={{
        borderRadius,
        // Let UIKit draw the same native rim and shadow as the keyboard capsule.
        // Clip the controls separately so scrolling never escapes the surface.
        overflow: "visible",
      }}
    >
      {/* Only the background may change type. Replacing a parent of the controls
          remounts them and dismisses their open searches, sheets, and inputs. */}
      {useGlass ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          isInteractive
          style={{ ...StyleSheet.absoluteFill, borderRadius }}
        />
      ) : (
        <View
          pointerEvents="none"
          className="bg-card border border-border"
          style={{ ...StyleSheet.absoluteFill, borderRadius }}
        />
      )}
      <View style={{ borderRadius, overflow: "hidden" }}>{children}</View>
    </View>
  );
};
