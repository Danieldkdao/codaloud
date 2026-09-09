import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, View, type LayoutChangeEvent } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useThemeColor } from "@/hooks/use-theme";

type WorkspaceTabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconProps;
};

const WorkspaceTabButton = ({
  isFocused,
  label,
  icon,
  style,
  ...props
}: WorkspaceTabButtonProps) => (
  <Pressable
    {...props}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    // TabTrigger passes inline space-between alignment, which overrides classes.
    style={(state) => [
      typeof style === "function" ? style(state) : style,
      { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    ]}
    className={cn(
      "min-h-12 min-w-0 flex-1 items-center justify-center rounded-full px-1 py-3 active:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
      isFocused && "bg-secondary",
    )}
  >
    <View className="flex-row items-center justify-center gap-1.5">
      <Icon
        {...icon}
        size={18}
        accessible={false}
        className={
          isFocused ? "text-secondary-foreground" : "text-muted-foreground"
        }
      />
      <PText
        accessible={false}
        numberOfLines={1}
        className={
          isFocused
            ? "font-medium text-secondary-foreground"
            : "text-muted-foreground"
        }
      >
        {label}
      </PText>
    </View>
  </Pressable>
);

type DockSurfaceProps = {
  children: ReactNode;
  useGlass: boolean;
};

const DockSurface = ({ children, useGlass }: DockSurfaceProps) => {
  const shadow = useThemeColor("navigation-shadow");

  return (
    <View style={{
      borderRadius: 36,
      boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: shadow }],
    }}>
      {useGlass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={{ borderRadius: 36 }}>
          {children}
        </GlassView>
      ) : (
        <View className="rounded-full border border-border bg-card">{children}</View>
      )}
    </View>
  );
};

type ProjectWorkspaceDockProps = {
  onLayout?: (event: LayoutChangeEvent) => void;
};

export const ProjectWorkspaceDock = ({ onLayout }: ProjectWorkspaceDockProps) => {
  const insets = useSafeAreaInsets();
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
    <View
      onLayout={onLayout}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View className="w-full self-center" style={{ maxWidth: 440, gap: 10, pointerEvents: "box-none" }}>
        <DockSurface useGlass={useGlass}>
          <View className="flex-row items-center gap-1 p-1.5">
            <TabTrigger name="files" asChild>
              <WorkspaceTabButton label="Files" icon={{ family: "Feather", name: "folder" }} />
            </TabTrigger>
            <TabTrigger name="code" asChild>
              <WorkspaceTabButton label="Code" icon={{ family: "Ionicons", name: "document-text-outline" }} />
            </TabTrigger>
            <TabTrigger name="git" asChild>
              <WorkspaceTabButton label="Git" icon={{ family: "Feather", name: "git-branch" }} />
            </TabTrigger>
            <TabTrigger name="agent" asChild>
              <WorkspaceTabButton label="Agent" icon={{ family: "Ionicons", name: "sparkles-outline" }} />
            </TabTrigger>
          </View>
        </DockSurface>

        <View className="w-full self-center" style={{ maxWidth: 360 }}>
          <DockSurface useGlass={useGlass}>
            <View className="flex-row items-center p-2">
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "center" }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous file"
                  className="size-12 items-center justify-center rounded-full active:bg-secondary">
                  <Icon family="Feather" name="arrow-left" size={20} accessible={false} className="text-foreground" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Next file"
                  className="size-12 items-center justify-center rounded-full active:bg-secondary">
                  <Icon family="Feather" name="arrow-right" size={20} accessible={false} className="text-foreground" />
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Microphone"
                className="size-14 items-center justify-center rounded-full bg-primary active:bg-primary/90">
                <Icon family="Feather" name="mic" size={24} accessible={false} className="text-primary-foreground" />
              </Pressable>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "center" }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Undo"
                  className="size-12 items-center justify-center rounded-full active:bg-secondary">
                  <Icon family="Feather" name="corner-up-left" size={20} accessible={false} className="text-foreground" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Redo"
                  className="size-12 items-center justify-center rounded-full active:bg-secondary">
                  <Icon family="Feather" name="corner-up-right" size={20} accessible={false} className="text-foreground" />
                </Pressable>
              </View>
            </View>
          </DockSurface>
        </View>
      </View>
    </View>
  );
};
