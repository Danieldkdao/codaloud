import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type { ReactNode } from "react";
import { View } from "react-native";

type SettingsSectionProps = { title: string; children: ReactNode };

export const SettingsSection = ({ title, children }: SettingsSectionProps) => (
  <View
    className="overflow-hidden rounded-2xl bg-card"
    style={{ borderCurve: "continuous" }}
  >
    <View
      className="mx-4 border-border py-4"
      style={{ borderBottomWidth: 0.5 }}
    >
      <PText
        accessibilityRole="header"
        className="text-xl font-semibold text-foreground"
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
        className={
          destructive ? "text-destructive" : "text-secondary-foreground"
        }
        accessible={false}
      />
    </View>
    <PText
      className={
        destructive
          ? "min-w-0 flex-1 text-destructive"
          : "min-w-0 flex-1 text-foreground"
      }
    >
      {label}
    </PText>
    {children}
  </View>
);
