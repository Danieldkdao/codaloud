import { cn } from "@/lib/utils";
import type { ComponentPropsWithRef } from "react";
import { Text } from "react-native";

export const HeadingText = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof Text>) => {
  return (
    <Text
      {...props}
      className={cn("text-base font-heading text-foreground", className)}
    />
  );
};
