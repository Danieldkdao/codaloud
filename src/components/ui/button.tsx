import { cva, type VariantProps } from "class-variance-authority";
import { Children, type ComponentPropsWithRef } from "react";
import { Pressable, Text } from "react-native";

import { LoadingSwap } from "@/components/loading-swap";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-lg active:opacity-80 disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border border-input bg-background",
        secondary: "bg-secondary",
        ghost: "bg-transparent active:bg-muted",
        destructive: "bg-destructive/10 active:bg-destructive/20",
        link: "bg-transparent",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        xs: "min-h-8 gap-1 rounded-md px-2 py-1",
        sm: "min-h-9 gap-1.5 px-3 py-1.5",
        lg: "min-h-12 px-6 py-3",
        icon: "size-11 p-0",
        "icon-xs": "size-8 rounded-md p-0",
        "icon-sm": "size-9 p-0",
        "icon-lg": "size-12 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Native text does not inherit its color or font from a Pressable.
export const buttonTextVariants = cva(
  "shrink text-center text-base font-sans font-medium",
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        outline: "text-foreground",
        secondary: "text-secondary-foreground",
        ghost: "text-foreground",
        destructive: "text-destructive",
        link: "text-primary underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type ButtonProps = ComponentPropsWithRef<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    /** Styles the automatic Text wrappers around string and number children. */
    textClassName?: string;
    /** Styles the content row, including spacing between icons and text. */
    contentClassName?: string;
    /** Styles the container that holds the content row and loading indicator. */
    contentContainerClassName?: string;
    loading?: boolean;
  };

export const Button = ({
  className,
  textClassName,
  contentClassName,
  contentContainerClassName,
  variant = "default",
  size = "default",
  disabled,
  loading = false,
  accessibilityState,
  children,
  ...props
}: ButtonProps) => {
  const isDisabled =
    loading || (disabled ?? accessibilityState?.disabled ?? false);

  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={isDisabled}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      className={cn(buttonVariants({ variant, size, className }))}
    >
      {(state) => (
        <LoadingSwap
          isLoading={loading}
          containerClassName={contentContainerClassName}
          className={cn(
            "gap-2",
            size === "xs" && "gap-1",
            size === "sm" && "gap-1.5",
            contentClassName,
          )}
          indicatorClassName={buttonTextVariants({
            variant,
            className: textClassName,
          })}
        >
          {Children.map(
            typeof children === "function" ? children(state) : children,
            (child) =>
              typeof child === "string" || typeof child === "number" ? (
                <Text
                  className={cn(
                    buttonTextVariants({ variant, className: textClassName }),
                  )}
                >
                  {child}
                </Text>
              ) : (
                child
              ),
          )}
        </LoadingSwap>
      )}
    </Pressable>
  );
};
