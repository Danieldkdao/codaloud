import { cn } from "@/lib/utils";
import type { ComponentPropsWithRef } from "react";
import { Text } from "react-native";

export const CodeText = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof Text>) => {
  return <Text {...props} className={cn("text-base font-mono", className)} />;
};
