import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { authClient } from "@/lib/auth/auth-client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

export const SignOutButton = () => {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setIsSigningOut(true);
    setError(null);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      router.replace("/");
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View className="gap-2 p-4">
      <Button
        variant="outline"
        loading={isSigningOut}
        onPress={() => void signOut()}
      >
        Sign out
      </Button>
      {error && (
        <PText accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </PText>
      )}
    </View>
  );
};
