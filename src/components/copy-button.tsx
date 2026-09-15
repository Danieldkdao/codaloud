import * as Clipboard from "expo-clipboard";
import { Children, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Button, buttonTextVariants, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { alert, cn } from "@/lib/utils";

export type CopyButtonProps = ButtonProps & { copyText: string };

export const CopyButton = ({
  copyText,
  children,
  onPress,
  variant = "default",
  size = "default",
  textClassName,
  contentClassName,
  disabled,
  accessibilityState,
  ...props
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setCopied(false);
    setCopying(false);
    pending.current = false;
    return () => {
      // A late clipboard result must not confirm a different value or unmounted button.
      generation.current++;
      if (timeout.current !== null) clearTimeout(timeout.current);
    };
  }, [copyText]);

  useEffect(() => {
    progress.value = withTiming(copied ? 1 : 0, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    });
  }, [copied, progress]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: reducedMotion ? [] : [{ translateY: -6 * progress.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reducedMotion ? [] : [{ translateY: 6 * (1 - progress.value) }],
  }));

  const copy = async () => {
    if (pending.current) return;
    const currentGeneration = generation.current;
    pending.current = true;
    setCopying(true);
    setCopied(false);
    if (timeout.current !== null) clearTimeout(timeout.current);
    try {
      const successful = await Clipboard.setStringAsync(copyText);
      if (generation.current !== currentGeneration) return;
      if (!successful) throw new Error("Copy failed");
      setCopied(true);
      AccessibilityInfo.announceForAccessibility("Copied to clipboard");
      timeout.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      if (generation.current === currentGeneration) {
        alert("Unable to copy. Please try again.");
      }
    } finally {
      if (generation.current === currentGeneration) {
        pending.current = false;
        setCopying(false);
      }
    }
  };

  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      textClassName={textClassName}
      contentClassName={contentClassName}
      disabled={copying || (disabled ?? accessibilityState?.disabled ?? false)}
      accessibilityState={{ ...accessibilityState, busy: copying || accessibilityState?.busy }}
      onPress={(event) => {
        void copy();
        onPress?.(event);
      }}
    >
      {(state) => (
        <View className="relative shrink items-center justify-center">
          {/* Keep the original content mounted so feedback never changes button dimensions. */}
          <Animated.View
            style={contentStyle}
            className={cn(
              "flex-row items-center justify-center gap-2",
              size === "xs" && "gap-1",
              size === "sm" && "gap-1.5",
              contentClassName,
            )}
          >
            {Children.map(typeof children === "function" ? children(state) : children, (child) =>
              typeof child === "string" || typeof child === "number" ? (
                <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{child}</Text>
              ) : child,
            )}
          </Animated.View>
          <Animated.View
            style={checkStyle}
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="absolute inset-0 items-center justify-center"
          >
            <Icon family="Feather" name="check" size={20} className="text-success-foreground" accessible={false} />
          </Animated.View>
        </View>
      )}
    </Button>
  );
};
