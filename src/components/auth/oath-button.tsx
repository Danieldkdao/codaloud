import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { isError } from "@/lib/utils";

export type OAuthButtonProps = ButtonProps & {
  provider: "github" | "apple";
};

export const OAuthButton = ({
  provider,
  disabled,
  loading,
  accessibilityState,
  onPress,
  ...props
}: OAuthButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const isDisabled =
    provider === "apple" ||
    (disabled ?? accessibilityState?.disabled ?? false) ||
    loading ||
    isPending;

  const handleOAuthSignIn = async () => {
    startTransition(async () => {
      try {
        const { error } = await authClient.signIn.social({
          provider,
          callbackURL: "/",
        });
        if (error) throw new Error(error.message || "Please try again.");
      } catch (error) {
        const message = isError(error) ? error.message : "Please try again.";
        alert(message);
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
        handleOAuthSignIn();
      }}
    />
  );
};
