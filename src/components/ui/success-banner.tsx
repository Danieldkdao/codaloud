import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

type SuccessBannerProps = {
  message: string;
  visible: boolean;
  onDismiss: () => void;
};

const checkEntrance = ZoomIn.duration(280)
  .delay(80)
  .reduceMotion(ReduceMotion.System);

export const SuccessBanner = ({
  message,
  visible,
  onDismiss,
}: SuccessBannerProps) => {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const shadowColor = useThemeColor("navigation-shadow");
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const position = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 200 : 180,
    });
    position.value = visible
      ? withSpring(1, {
          damping: 22,
          stiffness: 260,
          reduceMotion: ReduceMotion.System,
        })
      : withTiming(0, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [visible, opacity, position]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: reducedMotion
      ? []
      : [
          { translateY: (1 - position.value) * -18 },
          { scale: 0.98 + position.value * 0.02 },
        ],
  }));

  const banner = (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 1000,
          elevation: 1000,
          paddingTop: insets.top + 12,
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
    >
      <Animated.View
        style={[
          { width: "100%", maxWidth: 420, alignSelf: "center" },
          animatedStyle,
        ]}
      >
        <Pressable
          onPress={onDismiss}
          pointerEvents={visible ? "auto" : "none"}
          accessibilityRole="button"
          accessibilityLabel={message}
          accessibilityHint="Dismiss success message"
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4"
          style={{
            boxShadow: [
              { offsetX: 0, offsetY: 8, blurRadius: 24, color: shadowColor },
            ],
          }}
        >
          <Animated.View entering={checkEntrance} accessible={false}>
            <View className="size-6 items-center justify-center rounded-full bg-primary">
              <Icon
                family="Feather"
                name="check"
                size={14}
                className="text-primary-foreground"
              />
            </View>
          </Animated.View>
          <PText className="flex-1 font-semibold text-card-foreground text-lg">
            {message}
          </PText>
          <Icon
            family="Feather"
            name="x"
            size={18}
            className="text-muted-foreground"
            accessible={false}
          />
        </Pressable>
      </Animated.View>
    </View>
  );

  // iOS sheets live outside the screen's view hierarchy. Reattach on navigation
  // so newly presented sheets stay beneath the banner. Android screens 4.26
  // form sheets use CoordinatorLayout inside Stack, beneath this root sibling.
  return process.env.EXPO_OS === "ios" ? (
    <FullWindowOverlay
      key={pathname}
      unstable_accessibilityContainerViewIsModal={false}
    >
      {banner}
    </FullWindowOverlay>
  ) : (
    banner
  );
};
