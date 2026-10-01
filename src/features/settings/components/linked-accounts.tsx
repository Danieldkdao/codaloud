import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { formatAccountProvider } from "../lib/formatters";
import type { SupportedAccountProvider } from "../types";
import { SettingsSection } from "./settings-section";

type LinkedAccount = {
  id: string;
  providerId: string;
};

type AccountRowProps = {
  name: string;
  icon: ReactNode;
  connected: boolean;
  loading?: boolean;
  onPress?: () => void;
  last?: boolean;
};

const AccountRow = ({
  name,
  icon,
  connected,
  loading = false,
  onPress,
  last = false,
}: AccountRowProps) => (
  <View
    className="min-h-16 flex-row items-center gap-3 border-border py-3"
    style={{ borderBottomWidth: last ? 0 : 0.5 }}
  >
    <View className="size-8 items-center justify-center">{icon}</View>
    <View className="min-w-0 flex-1">
      <PText className="font-medium text-foreground">{name}</PText>
      <PText>{connected ? "Connected" : "Not connected"}</PText>
    </View>
    <Button
      variant={connected ? "destructive" : "secondary"}
      size="sm"
      loading={loading}
      onPress={onPress}
    >
      {connected ? "Unlink" : "Link"}
    </Button>
  </View>
);

export const LinkedAccounts = () => {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [pendingProvider, setPendingProvider] =
    useState<SupportedAccountProvider | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await authClient.listAccounts();
      if (result.error) {
        alert("Unable to load your linked accounts. Please try again.");
        return;
      }

      setAccounts(result.data ?? []);
    } catch {
      alert("Unable to load your linked accounts. Please try again.");
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const linkAccount = async (provider: SupportedAccountProvider) => {
    setPendingProvider(provider);

    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: "/account",
      });
      if (result.error) {
        alert(
          `Unable to link your ${formatAccountProvider(provider)} account. Please try again.`,
        );
        return;
      }

      await loadAccounts();
    } catch {
      alert(
        `Unable to link your ${formatAccountProvider(provider)} account. Please try again.`,
      );
    } finally {
      setPendingProvider(null);
    }
  };

  const unlinkAccount = async (
    account: LinkedAccount,
    provider: SupportedAccountProvider,
  ) => {
    setPendingProvider(provider);

    try {
      const result = await authClient.unlinkAccount({ accountId: account.id });
      if (result.error) {
        alert(
          `Unable to unlink your ${formatAccountProvider(provider)} account. Please try again.`,
        );
        return;
      }

      setAccounts((currentAccounts) =>
        currentAccounts.filter(
          (currentAccount) => currentAccount.id !== account.id,
        ),
      );
    } catch {
      alert(
        `Unable to unlink your ${formatAccountProvider(provider)} account. Please try again.`,
      );
    } finally {
      setPendingProvider(null);
    }
  };

  const googleAccount = accounts.find(
    (account) => account.providerId === "google",
  );
  const githubAccount = accounts.find(
    (account) => account.providerId === "github",
  );
  const appleAccount = accounts.find(
    (account) => account.providerId === "apple",
  );

  return (
    <SettingsSection
      title="Accounts"
      description="Use these accounts to sign in to Codaloud."
    >
      <View className="px-4 pb-4">
        <AccountRow
          name="Google"
          icon={<GoogleIcon />}
          connected={Boolean(googleAccount)}
          loading={pendingProvider === "google"}
          onPress={() =>
            googleAccount
              ? void unlinkAccount(googleAccount, "google")
              : void linkAccount("google")
          }
        />
        <AccountRow
          name="GitHub"
          icon={
            <Icon
              family="FontAwesome6"
              name="github"
              brand
              size={22}
              className="text-foreground"
              accessible={false}
            />
          }
          connected={Boolean(githubAccount)}
          loading={pendingProvider === "github"}
          onPress={() =>
            githubAccount
              ? void unlinkAccount(githubAccount, "github")
              : void linkAccount("github")
          }
        />
        <AccountRow
          name="Apple"
          icon={
            <Icon
              family="FontAwesome6"
              name="apple"
              brand
              size={23}
              className="text-foreground"
              accessible={false}
            />
          }
          connected={Boolean(appleAccount)}
          loading={pendingProvider === "apple"}
          onPress={() =>
            appleAccount
              ? void unlinkAccount(appleAccount, "apple")
              : void linkAccount("apple")
          }
          last
        />
      </View>
    </SettingsSection>
  );
};
