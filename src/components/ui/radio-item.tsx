import type { ComponentPropsWithRef } from "react";
import { Pressable, View } from "react-native";

import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type RadioItemProps<Value extends string = string> = Omit<
  ComponentPropsWithRef<typeof Pressable>,
  "children" | "onPress"
> & {
  value: Value;
  selectedValue: Value;
  onValueChange: (value: Value) => void;
  title: string;
  description?: string;
  icon?: IconProps;
};

export const RadioItem = <Value extends string>({
  value,
  selectedValue,
  onValueChange,
  title,
  description,
  icon,
  className,
  disabled,
  accessibilityState,
  "aria-disabled": ariaDisabled,
  ...props
}: RadioItemProps<Value>) => {
  const selected = value === selectedValue;
  const isDisabled =
    disabled ?? ariaDisabled ?? accessibilityState?.disabled ?? false;

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityHint={description}
      {...props}
      accessibilityRole="radio"
      accessibilityState={{
        ...accessibilityState,
        checked: selected,
        disabled: isDisabled,
      }}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onPress={() => onValueChange(value)}
      className={cn(
        "flex-row items-center gap-4 rounded-xl border-2 p-4 active:opacity-80",
        selected ? "border-primary bg-secondary" : "border-0! bg-background",
        isDisabled && "opacity-50",
        className,
      )}
    >
      {icon && (
        <Icon
          size={26}
          {...icon}
          className={cn(
            selected ? "text-secondary-foreground" : "text-muted-foreground",
            icon.className,
          )}
          accessible={false}
          aria-hidden
        />
      )}
      <View className="min-w-0 flex-1 gap-1">
        <PText className="font-semibold text-foreground">{title}</PText>
        {description && <PText>{description}</PText>}
      </View>
      <View
        className={cn(
          "size-6 items-center justify-center rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-muted-foreground",
        )}
        accessible={false}
        aria-hidden
      >
        {selected && (
          <View className="size-2 rounded-full bg-primary-foreground" />
        )}
      </View>
    </Pressable>
  );
};
