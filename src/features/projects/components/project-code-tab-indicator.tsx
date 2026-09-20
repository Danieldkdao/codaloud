import type { ReactNode } from "react";
import { View } from "react-native";
import { GlassSurface } from "@/components/ui/glass-surface";

export const ProjectCodeTabIndicator = ({
  children,
}: {
  children: ReactNode;
}) => (
  // The selected tab owns its glass bounds. A separately positioned list header
  // can retain stale coordinates when virtualized cells move or disappear.
  <View testID="code-tab-indicator">
    <GlassSurface borderRadius={24}>
      {children}
    </GlassSurface>
  </View>
);
