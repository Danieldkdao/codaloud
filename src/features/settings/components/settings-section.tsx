import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { View } from "react-native";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
  destructive?: boolean;
};

export const SettingsSection = ({
  title,
  children,
  destructive = false,
}: SettingsSectionProps) => (
  <View
    className={cn(
      "overflow-hidden rounded-2xl",
      destructive ? "bg-destructive/10" : "bg-card",
    )}
    style={{ borderCurve: "continuous" }}
  >
    <View
      className={cn(
        "mx-4 py-4",
        destructive ? "border-destructive/20" : "border-border",
      )}
      style={{ borderBottomWidth: 0.5 }}
    >
      <PText
        accessibilityRole="header"
        className={cn(
          "text-xl font-semibold",
          destructive ? "text-destructive" : "text-foreground",
        )}
      >
        {title}
      </PText>
    </View>
    {children}
  </View>
);

type SettingsRowProps = {
  label: string;
  icon: IconProps;
  children?: ReactNode;
  last?: boolean;
  destructive?: boolean;
};

export const SettingsRow = ({
  label,
  icon,
  children,
  last = false,
  destructive = false,
}: SettingsRowProps) => (
  <View
    className="mx-4 min-h-14 flex-row items-center gap-3 border-border py-3"
    style={{ borderBottomWidth: last ? 0 : 0.5 }}
  >
    <View className="size-6 items-center justify-center">
      <Icon
        {...icon}
        size={20}
        className={cn(
          destructive ? "text-destructive" : "text-secondary-foreground",
        )}
        accessible={false}
      />
    </View>
    <PText
      className={cn(
        "min-w-0 flex-1",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {label}
    </PText>
    {children}
  </View>
);
