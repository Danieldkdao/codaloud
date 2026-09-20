import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { formatEditorFontFamily } from "@/features/editor/lib/formatters";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithRef } from "react";
import { Text } from "react-native";

export const CodeText = ({
  className,
  style,
  ...props
}: ComponentPropsWithRef<typeof Text>) => {
  const { preferences } = useEditorPreferences();
  return <Text {...props} className={cn("text-base font-mono", className)} style={[{ fontFamily: `${formatEditorFontFamily(preferences.font)}_400Regular` }, style]} />;
};
