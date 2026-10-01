import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { AppleSignInLogo } from "./apple-sign-in-logo";
import { GoogleIcon } from "./google-icon";
import * as AppleAuthentication from "expo-apple-authentication";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

type SocialProvider = "github" | "google" | "apple";

export const SocialSignInButtons = () => {
  const router = useRouter();
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
    null,
  );
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let mounted = true;
    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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

  const signInWithApple = async () => {
    if (isSigningIn) return;

    setPendingProvider("apple");
    try {
      const nonce = randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        alert("Unable to sign in. Please try again.");
        return;
      }

      const firstName = credential.fullName?.givenName ?? undefined;
      const lastName = credential.fullName?.familyName ?? undefined;
      const result = await authClient.signIn.social({
        provider: "apple",
        idToken: {
          token: credential.identityToken,
          nonce,
          ...(firstName || lastName
            ? { user: { name: { firstName, lastName } } }
            : {}),
        },
      });
      if (result.error) {
        alert("Unable to sign in. Please try again.");
        return;
      }

      router.replace("/");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      alert("Unable to sign in. Please try again.");
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <View className="gap-3">
      <Button
        size="lg"
        className="w-full h-14 bg-foreground py-0"
        textClassName="text-background text-xl font-medium"
        accessibilityLabel="Continue with GitHub"
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
        className="w-full h-14 py-0"
        textClassName="text-xl font-medium"
        accessibilityLabel="Continue with Google"
        disabled={isSigningIn}
        loading={pendingProvider === "google"}
        onPress={() => void signIn("google")}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      {(Platform.OS !== "ios" || appleAvailable) && (
        <Button
          size="lg"
          className="w-full h-14 bg-apple-sign-in-background py-0"
          contentClassName="gap-0"
          textClassName="text-apple-sign-in-foreground text-xl font-medium"
          accessibilityLabel="Continue with Apple"
          disabled={isSigningIn}
          loading={pendingProvider === "apple"}
          onPress={() =>
            void (Platform.OS === "ios" ? signInWithApple() : signIn("apple"))
          }
        >
          <AppleSignInLogo />
          Continue with Apple
        </Button>
      )}
    </View>
  );
};
