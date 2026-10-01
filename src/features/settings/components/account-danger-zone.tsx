import { Button } from "@/components/ui/button";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { HeadingText, PText } from "@/components/ui/text";
import { useBillingStatus } from "@/features/billing/hooks/use-billing-status";
import { showCustomerCenter } from "@/features/billing/revenuecat-client";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Switch, View } from "react-native";
import {
  clearDeletedAccountSession,
  deleteLocalAccountData,
} from "../delete-local-account-data";
import { SettingsSection } from "./settings-section";

export const AccountDangerZone = ({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) => {
  const router = useRouter();
  const {
    data: billing,
    isPending: billingPending,
    refetch,
  } = useBillingStatus(userId);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [deleteDeviceData, setDeleteDeviceData] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const availableCredits = billing
    ? billing.monthlyCredits + billing.purchasedCredits
    : null;
  const emailMatches =
    confirmationEmail.trim().toLowerCase() === email.toLowerCase();

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

  const deleteAccount = async () => {
    if (!billing || !emailMatches || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await authClient.deleteUser();
      if (result.error)
        throw new Error(
          result.error.code === "SESSION_EXPIRED"
            ? "Sign out and sign in again, then retry account deletion."
            : (result.error.message ?? "Unable to delete your account."),
        );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to delete your account. Please sign in again and retry.",
      );
      setIsDeleting(false);
      return;
    }

    try {
      if (deleteDeviceData) await deleteLocalAccountData();
      else await clearDeletedAccountSession();
    } catch {
      alert("Account deleted, but some device data could not be removed.");
    }
    setIsDeleting(false);
    setOpen(false);
    router.replace("/");
  };

  const manageSubscription = async () => {
    try {
      await showCustomerCenter(userId);
    } catch {
      if (billing?.managementUrl) await Linking.openURL(billing.managementUrl);
      else alert("Subscription management is unavailable right now.");
    }
  };

  return (
    <>
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
            onPress={() => setOpen(true)}
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
      <ContentSheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setConfirmationEmail("");
            setDeleteDeviceData(false);
          }
        }}
        liquidGlass
      >
        <View className="gap-4 p-6">
          <HeadingText className="text-2xl font-semibold">
            Delete account?
          </HeadingText>
          <PText className="text-lg">
            {billingPending
              ? "Loading your credit balance…"
              : availableCredits === null
                ? "Your credit balance is unavailable."
                : `${availableCredits.toLocaleString()} credits will be permanently deleted, including purchased credits. They cannot be restored or transferred.`}
          </PText>
          {availableCredits === null && !billingPending && (
            <Button variant="outline" onPress={() => void refetch()}>
              Retry balance
            </Button>
          )}
          <PText className="text-lg">
            Deleting your Codaloud account does not cancel an Apple or Google
            subscription.
          </PText>
          {(billing?.paidThrough || billing?.managementUrl) && (
            <Button variant="outline" onPress={() => void manageSubscription()}>
              Manage subscription
            </Button>
          )}
          <View className="gap-2">
            <PText className="text-lg">Type {email} to confirm</PText>
            <Input
              accessibilityLabel="Confirmation email"
              value={confirmationEmail}
              onChangeText={setConfirmationEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              className="rounded-xl border border-input bg-background px-4 py-3 font-sans text-base text-foreground"
            />
          </View>
          <View className="flex-col gap-3">
            <PText className="flex-1 text-lg">
              Also delete projects and local data from this device
            </PText>
            <Switch
              accessibilityLabel="Also delete projects and local data from this device"
              value={deleteDeviceData}
              onValueChange={setDeleteDeviceData}
            />
          </View>
          <Button
            variant="destructive"
            size="lg"
            disabled={!emailMatches || !billing}
            loading={isDeleting}
            onPress={() => void deleteAccount()}
          >
            Delete my account
          </Button>
          <Button variant="ghost" onPress={() => setOpen(false)}>
            Keep account
          </Button>
        </View>
      </ContentSheet>
    </>
  );
};
