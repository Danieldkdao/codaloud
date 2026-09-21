import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SettingsSection } from "./settings-section";

export const AccountDangerZone = () => {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        alert("Unable to sign out. Please try again.");
        return;
      }

      router.replace("/");
    } catch {
      alert("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SettingsSection title="Danger zone" destructive>
      <View className="gap-3 p-4">
        <Button
          variant="destructive"
          size="lg"
          contentContainerClassName="w-full"
          contentClassName="w-full justify-center"
          loading={isSigningOut}
          onPress={() => void signOut()}
        >
          <Icon
            family="Feather"
            name="log-out"
            size={20}
            className="absolute left-0 text-destructive"
            accessible={false}
          />
          Sign out
        </Button>
        <Button
          variant="destructive"
          size="lg"
          contentContainerClassName="w-full"
          contentClassName="w-full justify-center"
        >
          <Icon
            family="Feather"
            name="trash-2"
            size={20}
            className="absolute left-0 text-destructive"
            accessible={false}
          />
          Delete account
        </Button>
      </View>
    </SettingsSection>
  );
};
