import { useTransition } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { alert, isError } from "@/lib/utils";

export type SignOutButtonProps = ButtonProps;

export const SignOutButton = ({
  disabled,
  loading,
  accessibilityState,
  onPress,
  ...props
}: SignOutButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const isDisabled =
    (disabled ?? accessibilityState?.disabled ?? false) || loading || isPending;

  const handleSignOut = () => {
    startTransition(async () => {
      try {
        const { error } = await authClient.signOut();
        if (error) throw new Error(error.message || "Unable to sign out.");
      } catch (error) {
        alert(
          isError(error)
            ? error.message
            : "Unable to sign out. Please try again.",
        );
      }
    });
  };

  return (
    <Button
      {...props}
      accessibilityState={accessibilityState}
      disabled={isDisabled}
      loading={loading || isPending}
      onPress={(event) => {
        if (isDisabled) return;
        onPress?.(event);
        if (event.isDefaultPrevented()) return;
        handleSignOut();
      }}
    />
  );
};
