import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { authClient } from "@/lib/auth/auth-client";
import { GoogleIcon } from "./google-icon";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

type SocialProvider = "github" | "google";

export const SocialSignInButtons = () => {
  const router = useRouter();
  const [pendingProvider, setPendingProvider] =
    useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: SocialProvider) => {
    setPendingProvider(provider);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/",
      });

      if (result.error) {
        setError("Unable to sign in. Please try again.");
        return;
      }

      router.replace("/");
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setPendingProvider(null);
    }
  };

  const isSigningIn = pendingProvider !== null;

  return (
    <View className="gap-3">
      <Button
        size="lg"
        className="min-h-14 bg-foreground"
        textClassName="text-background"
        disabled={isSigningIn}
        loading={pendingProvider === "github"}
        onPress={() => void signIn("github")}
      >
        <Icon
          family="FontAwesome6"
          name="github"
          brand
          size={22}
          className="text-background"
          accessible={false}
        />
        Continue with GitHub
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="min-h-14"
        disabled={isSigningIn}
        loading={pendingProvider === "google"}
        onPress={() => void signIn("google")}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="min-h-14"
      >
        <Icon
          family="FontAwesome6"
          name="apple"
          brand
          size={23}
          className="text-secondary-foreground"
          accessible={false}
        />
        Continue with Apple
      </Button>
      {error && (
        <PText accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </PText>
      )}
    </View>
  );
};
