import { GlassView } from "expo-glass-effect";
import { type ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useLiquidGlass } from "@/hooks/use-liquid-glass";

type GlassSurfaceProps = {
  children: ReactNode;
  borderRadius?: number;
  style?: ViewProps["style"];
};

/** Native glass when available, with an opaque, accessible fallback. */
export const GlassSurface = ({
  children,
  borderRadius = 28,
  style,
}: GlassSurfaceProps) => {
  const useGlass = useLiquidGlass();

  return (
    <View
      style={[
        {
          borderRadius,
          // Let UIKit draw the same native rim and shadow as the keyboard capsule.
          // Clip the controls separately so scrolling never escapes the surface.
          overflow: "visible",
        },
        style,
      ]}
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
      <View style={{ borderRadius, overflow: "hidden", flexShrink: 1 }}>
        {children}
      </View>
    </View>
  );
};
