import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { CreateProjectButton } from "@/features/projects/components/create-project-button";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { MAIN_TAB_BAR_HEIGHT } from "@/lib/constants";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useRouter } from "expo-router";
import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconProps;
  selectedIcon: IconProps;
};

const TabButton = ({
  isFocused,
  label,
  icon,
  selectedIcon,
  ...props
}: TabButtonProps) => (
  <Pressable
    {...props}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    style={{
      height: MAIN_TAB_BAR_HEIGHT - 8,
      flexDirection: "column",
      justifyContent: "center",
    }}
    className={cn(
      "min-w-0 flex-1 items-center justify-center rounded-full active:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
      isFocused && "bg-secondary",
    )}
  >
    <Icon
      {...(isFocused ? selectedIcon : icon)}
      size={24}
      accessible={false}
      className={isFocused ? "text-secondary-foreground" : "text-foreground"}
    />
    <PText
      accessible={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      className={isFocused ? "text-secondary-foreground" : "text-foreground"}
    >
      {label}
    </PText>
  </Pressable>
);

export const MainTabBar = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shadow = useThemeColor("navigation-shadow");
  const [reduceTransparency, setReduceTransparency] = useState(true);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (active) setReduceTransparency(enabled);
    });
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

  const tabs = (
    <View
      className="flex-1 flex-row items-center"
      style={{ padding: 4, gap: 4 }}
    >
      <TabTrigger name="projects" asChild>
        <TabButton
          label="Projects"
          icon={{ family: "Ionicons", name: "folder-outline" }}
          selectedIcon={{ family: "Ionicons", name: "folder" }}
        />
      </TabTrigger>
      <TabTrigger name="drafts" asChild>
        <TabButton
          label="Drafts"
          icon={{ family: "Ionicons", name: "document-text-outline" }}
          selectedIcon={{ family: "Ionicons", name: "document-text" }}
        />
      </TabTrigger>
      <TabTrigger name="account" asChild>
        <TabButton
          label="Account"
          icon={{ family: "Ionicons", name: "person-circle-outline" }}
          selectedIcon={{ family: "Ionicons", name: "person-circle" }}
        />
      </TabTrigger>
    </View>
  );

  return (
    <View
      style={{
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View className="w-full max-w-md flex-row items-center gap-3 self-center">
        <View
          className="min-w-0 flex-1 rounded-full"
          style={{
            height: MAIN_TAB_BAR_HEIGHT,
            boxShadow: [
              { offsetX: 0, offsetY: 4, blurRadius: 18, color: shadow },
            ],
          }}
        >
          {useGlass ? (
            <GlassView
              style={{
                height: MAIN_TAB_BAR_HEIGHT,
                borderRadius: MAIN_TAB_BAR_HEIGHT / 2,
              }}
              glassEffectStyle="regular"
              isInteractive
            >
              {tabs}
            </GlassView>
          ) : (
            <View className="flex-1 rounded-full bg-card">{tabs}</View>
          )}
        </View>
        <CreateProjectButton onPress={() => router.push("/new-project")} />
      </View>
    </View>
  );
};
