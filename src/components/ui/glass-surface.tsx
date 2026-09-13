import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { useThemeColor } from "@/hooks/use-theme";

type GlassSurfaceProps = {
  children: ReactNode;
  borderRadius?: number;
  shadow?: boolean;
};

/** Native glass when available, with an opaque, accessible fallback. */
export const GlassSurface = ({ children, borderRadius = 28, shadow = true }: GlassSurfaceProps) => {
  const shadowColor = useThemeColor("navigation-shadow");
  const [reduceTransparency, setReduceTransparency] = useState(true);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (active) setReduceTransparency(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged", setReduceTransparency,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const useGlass = !reduceTransparency && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  return (
    <View style={{
      borderRadius,
      boxShadow: shadow ? [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: shadowColor }] : undefined,
      // Inline glass controls also contain the native effect within their outline.
      overflow: shadow ? "visible" : "hidden",
    }}>
      {useGlass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={{ borderRadius }}>
          {children}
        </GlassView>
      ) : (
        <View className="bg-card" style={{ borderRadius }}>
          {children}
          <View pointerEvents="none" className="border border-border"
            style={{ ...StyleSheet.absoluteFill, borderRadius }} />
        </View>
      )}
    </View>
  );
};
