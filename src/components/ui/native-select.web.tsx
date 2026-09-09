import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import type { NativeSelectProps } from "@/components/ui/native-select";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type { NativeSelectProps } from "@/components/ui/native-select";

export const NativeSelect = ({ label, icon, trigger, sections }: NativeSelectProps) => {
  const selectedLabels = sections.map((section) =>
    section.options.find((option) => option.value === section.value)?.label,
  ).filter(Boolean).join(", ");

  return (
    <View className={trigger ? "relative min-h-12 justify-center rounded-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring" : cn(
      "relative min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-input bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
      icon ? "size-12 shrink-0" : "px-3",
    )}>
      {trigger ?? icon ?? (
        <>
          <PText aria-hidden className="font-medium">{label}</PText>
          <Icon family="Feather" name="chevron-down" size={18} className="text-muted-foreground" aria-hidden />
        </>
      )}
      {/* Each group has its own selection. Reset the native select to its prompt after each action. */}
      <select
        aria-label={`${label}: ${selectedLabels}`}
        value=""
        onChange={(event) => {
          for (const [sectionIndex, section] of sections.entries()) {
            const option = section.options.find((option) =>
              `${sectionIndex}:${option.value}` === event.target.value,
            );
            if (option) {
              option.onSelect();
              return;
            }
          }
        }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
      >
        <option value="" disabled hidden>{label}</option>
        {sections.map((section, sectionIndex) => (
          <optgroup key={sectionIndex} label={section.label}>
            {section.options.map((option) => (
              <option key={option.value} value={`${sectionIndex}:${option.value}`}>
                {option.value === section.value ? `✓ ${option.label}` : option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </View>
  );
};
