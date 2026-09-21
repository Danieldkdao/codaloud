import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { cn } from "@/lib/utils";

export type LoadingSwapProps = {
  isLoading: boolean;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  indicatorClassName?: string;
};

export const LoadingSwap = ({
  isLoading,
  children,
  className,
  containerClassName,
  indicatorClassName,
}: LoadingSwapProps) => (
  <View
    className={cn(
      "relative shrink items-center justify-center",
      containerClassName,
    )}
  >
    {/* Opacity keeps the content's dimensions and accessible label intact. */}
    <View
      pointerEvents={isLoading ? "none" : "auto"}
      className={cn(
        "flex-row items-center justify-center",
        className,
        isLoading ? "opacity-0" : "opacity-100",
      )}
    >
      {children}
    </View>
    {isLoading && (
      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center"
      >
        <ActivityIndicator
          size="small"
          accessible={false}
          className={cn("text-foreground", indicatorClassName)}
        />
      </View>
    )}
  </View>
);
