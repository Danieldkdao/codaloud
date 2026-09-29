import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

export const KeyboardKey = ({
  label,
  hint,
  onPress,
  disabled = false,
  children,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint={hint}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    className="h-12 w-11 items-center justify-center active:opacity-50 disabled:opacity-40"
  >
    <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
      {children}
    </View>
  </Pressable>
);
