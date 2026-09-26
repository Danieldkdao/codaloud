import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { GoogleIcon } from "./google-icon";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

type SocialProvider = "github" | "google";

export const SocialSignInButtons = () => {
  const router = useRouter();
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
    null,
  );

  const signIn = async (provider: SocialProvider) => {
    setPendingProvider(provider);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/",
      });

      if (result.error) {
        alert("Unable to sign in. Please try again.");
        return;
      }

      router.replace("/");
    } catch {
      alert("Unable to sign in. Please try again.");
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
        textClassName="text-background text-lg font-medium"
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
        variant="secondary"
        size="lg"
        className="min-h-14"
        textClassName="text-lg font-medium"
        disabled={isSigningIn}
        loading={pendingProvider === "google"}
        onPress={() => void signIn("google")}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="min-h-14"
        textClassName="text-lg font-medium"
      >
        <Icon
          family="FontAwesome6"
          name="apple"
          brand
          size={23}
          className="text-foreground"
          accessible={false}
        />
        Continue with Apple
      </Button>
    </View>
  );
};
