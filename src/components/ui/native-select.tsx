import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { ReactNode } from "react";

import { NativeSelectTrigger } from "@/components/ui/native-select-trigger";

export type NativeSelectProps = {
  label: string;
  icon?: ReactNode;
  /** Custom visual content; the native menu still owns the tap target. */
  trigger?: ReactNode;
  sections: readonly {
    label: string;
    value: string;
    options: readonly {
      value: string;
      label: string;
      image?: MenuAction["image"];
      onSelect: () => void;
    }[];
  }[];
};

export const NativeSelect = ({ label, icon, trigger, sections }: NativeSelectProps) => {
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
          image: option.image,
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
      <NativeSelectTrigger label={label} icon={icon} trigger={trigger} sections={sections} />
    </MenuView>
  );
};
