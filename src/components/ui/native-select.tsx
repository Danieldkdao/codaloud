import { MenuView } from "@expo/ui/community/menu";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type NativeSelectProps = {
  label: string;
  icon?: ReactNode;
  sections: readonly {
    label: string;
    value: string;
    options: readonly {
      value: string;
      label: string;
      onSelect: () => void;
    }[];
  }[];
};

export const NativeSelect = ({ label, icon, sections }: NativeSelectProps) => {
  const selectedLabels = sections.map((section) =>
    section.options.find((option) => option.value === section.value)?.label,
  ).filter(Boolean).join(", ");

  return (
    <MenuView
      shouldOpenOnLongPress={false}
      actions={sections.map((section, sectionIndex) => ({
        id: String(sectionIndex),
        title: section.label,
        displayInline: true,
        subactions: section.options.map((option) => ({
          id: `${sectionIndex}:${option.value}`,
          title: option.label,
          state: option.value === section.value ? "on" : "off",
        })),
      }))}
      onPressAction={({ nativeEvent }) => {
        for (const [sectionIndex, section] of sections.entries()) {
          const option = section.options.find((option) =>
            `${sectionIndex}:${option.value}` === nativeEvent.event,
          );
          if (option) {
            option.onSelect();
            return;
          }
        }
      }}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabels}`}
        accessibilityHint="Opens available options"
        className={cn(
          "min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-input bg-card",
          icon ? "size-12" : "px-3",
        )}
      >
        {icon ?? (
          <>
            <PText className="font-medium">{label}</PText>
            <Icon family="Feather" name="chevron-down" size={18} className="text-muted-foreground" accessible={false} />
          </>
        )}
      </View>
    </MenuView>
  );
};
