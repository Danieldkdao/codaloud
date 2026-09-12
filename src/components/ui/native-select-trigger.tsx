import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import type { NativeSelectProps } from "@/components/ui/native-select";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export const NativeSelectTrigger = ({ label, icon, trigger, sections }: NativeSelectProps) => {
  const selectedLabels = sections.map((section) =>
    section.options.find((option) => option.value === section.value)?.label,
  ).filter(Boolean).join(", ");

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${selectedLabels}`}
      accessibilityHint="Opens available options"
      className={trigger ? "min-h-12 justify-center" : cn(
        "min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-input bg-card",
        icon ? "size-12" : "px-3",
      )}
    >
      {trigger ?? icon ?? (
        <>
          <PText className="font-medium">{label}</PText>
          <Icon family="Feather" name="chevron-down" size={18} className="text-muted-foreground" accessible={false} />
        </>
      )}
    </View>
  );
};
