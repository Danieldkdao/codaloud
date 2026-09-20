import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { formatNativeEditorFontClass } from "@/features/editor/lib/formatters";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithRef } from "react";
import { Text } from "react-native";

export const CodeText = ({
  className,
  style,
  ...props
}: ComponentPropsWithRef<typeof Text>) => {
  const { preferences } = useEditorPreferences();
  return (
    <Text
      {...props}
      className={cn(
        "text-base font-mono",
        formatNativeEditorFontClass(preferences.font),
        className,
      )}
      style={style}
    />
  );
};
