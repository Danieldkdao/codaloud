import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type ProjectChangeCheckboxProps = {
  checked: boolean | "mixed";
  label: string;
  onPress: () => void;
  children?: ReactNode;
  className?: string;
};

export const ProjectChangeCheckbox = ({
  checked,
  label,
  onPress,
  children,
  className,
}: ProjectChangeCheckboxProps) => (
  <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={label}
    accessibilityState={{ checked }}
    onPress={onPress}
    className={cn(
      "min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-secondary",
      className,
    )}
  >
    <View
      accessible={false}
      className={cn(
        "size-6 items-center justify-center rounded-md border",
        checked
          ? "border-primary bg-primary"
          : "border-muted-foreground bg-background",
      )}
    >
      {checked ? (
        <Icon
          family="Feather"
          name={checked === "mixed" ? "minus" : "check"}
          size={16}
          className="text-primary-foreground"
          accessible={false}
        />
      ) : null}
    </View>
    {children}
  </Pressable>
);

