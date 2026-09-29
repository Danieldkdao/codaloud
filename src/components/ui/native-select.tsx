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
    kind?: "actions";
    options: readonly {
      value: string;
      label: string;
      disabled?: boolean;
      image?: MenuAction["image"];
      onSelect: () => void;
      subactions?: readonly {
        value: string;
        label: string;
        image?: MenuAction["image"];
        onSelect: () => void;
      }[];
    }[];
  }[];
};

export const NativeSelect = ({
  label,
  icon,
  trigger,
  sections,
}: NativeSelectProps) => {
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
          attributes: { disabled: option.disabled },
          state:
            section.kind === "actions"
              ? undefined
              : option.value === section.value
                ? "on"
                : "off",
          subactions: option.subactions?.map((child) => ({
            id: `${sectionIndex}:${option.value}:${child.value}`,
            title: child.label,
            image: child.image,
          })),
        })),
      }))}
      onPressAction={({ nativeEvent }) => {
        for (const [sectionIndex, section] of sections.entries()) {
          const option = section.options.find(
            (option) => `${sectionIndex}:${option.value}` === nativeEvent.event,
          );
          if (option && !option.disabled) {
            option.onSelect();
            return;
          }
          for (const parent of section.options) {
            const child = parent.subactions?.find(
              (item) =>
                `${sectionIndex}:${parent.value}:${item.value}` ===
                nativeEvent.event,
            );
            if (child) {
              child.onSelect();
              return;
            }
          }
        }
      }}
    >
      <NativeSelectTrigger
        label={label}
        icon={icon}
        trigger={trigger}
        sections={sections}
      />
    </MenuView>
  );
};
