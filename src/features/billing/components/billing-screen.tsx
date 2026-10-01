import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { authClient } from "@/lib/auth/auth-client";
import { alert, cn, confirmAction } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  startBillingTrial,
  endBillingTrial,
  type BillingStatusSchema,
} from "../billing-actions";
import { addBillingMonth } from "../billing-rules";
import { useBillingStatus } from "../hooks/use-billing-status";
import {
  formatBillingDate,
  formatBillingTier,
  type BillingTab,
} from "../lib/formatters";
import {
  restoreBillingPurchases,
  showCustomerCenter,
  showPlansPaywall,
  manageStoreSubscription,
} from "../revenuecat-client";
import { BillingTabPanel, BillingTabs } from "./billing-tabs";

const PlanCard = ({
  name,
  credits,
  price,
  current,
}: {
  name: "Free" | "Pro" | "Premium";
  credits: number;
  price: string;
  current: boolean;
}) => (
  <View
    className={cn(
      "gap-3 rounded-2xl border p-5",
      current ? "border-primary bg-primary/10" : "border-border bg-card",
    )}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-row items-center gap-3">
        <View className="size-13 items-center justify-center rounded-full bg-primary/10">
          <Icon
            family="Feather"
            name={name === "Premium" ? "star" : name === "Pro" ? "zap" : "code"}
            size={21}
            className="text-primary"
            accessible={false}
          />
        </View>
        <View>
          <PText className="text-2xl font-semibold">{name}</PText>
          <PText className="text-muted-foreground text-lg">{price}</PText>
        </View>
      </View>
      {current && (
        <View className="rounded-full px-4 py-1.5 bg-primary">
          <PText className="text-primary-foreground font-medium">Current</PText>
        </View>
      )}
    </View>
    <View className="flex-row items-center gap-2">
      <Icon
        family="Feather"
        name="check-circle"
        size={18}
        className="text-primary"
      />
      <PText className="text-lg">
        {credits.toLocaleString()} credits each month
      </PText>
    </View>
  </View>
);

const UsageContent = ({
  status,
  nextCreditDate,
  onAddCredits,
}: {
  status: BillingStatusSchema;
  nextCreditDate: string | null;
  onAddCredits: () => void;
}) => {
  const available = status.monthlyCredits + status.purchasedCredits;
  const progress = Math.min(
    100,
    (status.monthlyCredits / Math.max(1, status.monthlyAllowance)) * 100,
  );
  return (
    <View className="gap-4">
      <View className="gap-4 rounded-3xl bg-primary p-6">
        <View className="flex-row items-center gap-2">
          <Icon
            family="Feather"
            name="zap"
            size={20}
            className="text-primary-foreground"
          />
          <PText className="text-primary-foreground text-lg">
            Available credits
          </PText>
        </View>
        <HeadingText className="text-5xl text-primary-foreground">
          {available.toLocaleString()}
        </HeadingText>
        <PText className="text-primary-foreground text-lg">
          of {status.monthlyAllowance.toLocaleString()} monthly credits left
        </PText>
        <View className="h-2 overflow-hidden rounded-full bg-primary-foreground/30">
          <View
            className="h-2 rounded-full bg-primary-foreground"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1 gap-2 rounded-2xl border border-border bg-card p-4">
          <Icon
            family="Feather"
            name="calendar"
            size={21}
            className="text-primary"
          />
          <PText className="text-muted-foreground text-lg">Monthly</PText>
          <PText className="text-2xl font-semibold">
            {status.monthlyCredits.toLocaleString()}
          </PText>
        </View>
        <View className="min-w-0 flex-1 gap-2 rounded-2xl border border-border bg-card p-4">
          <Icon
            family="Feather"
            name="plus-circle"
            size={21}
            className="text-primary"
          />
          <PText className="text-muted-foreground text-lg">Purchased</PText>
          <PText className="text-2xl font-semibold">
            {status.purchasedCredits.toLocaleString()}
          </PText>
        </View>
      </View>
      <View className="flex-row items-center gap-2 rounded-2xl bg-secondary/50 p-4">
        <Icon
          family="Feather"
          name="refresh-cw"
          size={18}
          className="text-primary"
        />
        <PText className="flex-1 text-lg">
          Refreshes{" "}
          {nextCreditDate ? formatBillingDate(nextCreditDate) : "soon"}
        </PText>
      </View>
      <Button size="lg" onPress={onAddCredits}>
        {status.tier === "free" ? "Explore plans" : "Add credits"}
      </Button>
    </View>
  );
};

export const BillingScreen = () => {
  const userId = authClient.useSession().data?.user.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: status, isPending, refetch } = useBillingStatus(userId);
  const [busy, setBusy] = useState(false);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<BillingTab>(
    params.tab === "subscription" ? "subscription" : "usage",
  );

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["billing", userId] });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Billing is unavailable. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const nextCreditDate = status
    ? addBillingMonth(status.cycleAnchor, status.cycleIndex + 1)
    : null;

  return (
    <AppWrapper headerShown>
      <View className="w-full max-w-xl gap-5 self-center">
        <BillingTabs tab={tab} onTabChange={setTab} />
        {isPending && userId && <PText>Loading your balance…</PText>}
        {!userId && <PText>Sign in to see billing.</PText>}
        {!isPending && userId && !status && (
          <View className="gap-3 rounded-2xl bg-card p-5">
            <PText>Billing is unavailable right now.</PText>
            <Button onPress={() => void refetch()}>Try again</Button>
          </View>
        )}
        {status && (
          <>
            <BillingTabPanel active={tab === "usage"}>
              <UsageContent
                status={status}
                nextCreditDate={nextCreditDate}
                onAddCredits={() =>
                  status.tier === "free"
                    ? setTab("plans")
                    : router.push("/billing/topups" as Href)
                }
              />
            </BillingTabPanel>
            <BillingTabPanel active={tab === "plans"}>
              <View className="gap-3">
                <PlanCard
                  name="Free"
                  credits={50}
                  price="Included"
                  current={status.tier === "free"}
                />
                <PlanCard
                  name="Pro"
                  credits={200}
                  price="From $14.99/month"
                  current={status.tier === "tier_1"}
                />
                <PlanCard
                  name="Premium"
                  credits={1000}
                  price="From $39.99/month"
                  current={status.tier === "tier_2"}
                />
                <PText className="px-1 text-muted-foreground text-lg">
                  Pro and Premium include the same tools. The store confirms
                  local prices.
                </PText>
                {!status.trialUsed && status.tier === "free" && (
                  <Button
                    variant="secondary"
                    size="lg"
                    loading={busy}
                    onPress={() =>
                      void run(async () => {
                        if (!(await startBillingTrial()))
                          throw new Error("Trial could not start.");
                      })
                    }
                  >
                    Start 3-day Pro trial
                  </Button>
                )}
                <Button
                  size="lg"
                  loading={busy}
                  onPress={() =>
                    userId && void run(() => showPlansPaywall(userId))
                  }
                >
                  Compare plans
                </Button>
              </View>
            </BillingTabPanel>
            <BillingTabPanel active={tab === "subscription"}>
              <View className="gap-4">
                <View className="gap-4 rounded-3xl bg-card p-6">
                  <View className="flex-row items-center gap-3">
                    <View className="size-13 items-center justify-center rounded-full bg-primary/10">
                      <Icon
                        family="Feather"
                        name="credit-card"
                        size={23}
                        className="text-primary"
                      />
                    </View>
                    <View>
                      <PText className="text-muted-foreground text-lg">
                        Your plan
                      </PText>
                      <HeadingText className="text-2xl font-semibold">
                        {formatBillingTier(status.tier)}
                      </HeadingText>
                    </View>
                  </View>
                  <View className="h-px bg-border" />
                  <PText className="text-lg">
                    {status.trialEndsAt
                      ? `Trial ends ${formatBillingDate(status.trialEndsAt)}`
                      : status.paidThrough
                        ? `${status.willRenew ? "Renews" : "Access ends"} ${formatBillingDate(status.paidThrough)}`
                        : "50 credits refresh each month"}
                  </PText>
                  {status.billingPeriod && (
                    <PText className="text-muted-foreground">
                      {status.billingPeriod === "yearly"
                        ? "Billed yearly · credits refresh monthly"
                        : "Billed monthly"}
                    </PText>
                  )}
                </View>
                <Button
                  size="lg"
                  loading={busy}
                  onPress={() => {
                    if (status.tier === "free") {
                      setTab("plans");
                      return;
                    }
                    if (userId)
                      void run(async () => {
                        try {
                          await showCustomerCenter(userId);
                        } catch (error) {
                          await manageStoreSubscription(
                            userId,
                            status.managementUrl,
                          );
                        }
                      });
                  }}
                >
                  {status.tier === "free"
                    ? "Explore plans"
                    : "Manage subscription"}
                </Button>
                {status.tier !== "free" && (
                  <View className="gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      loading={busy}
                      onPress={() => {
                        if (!userId || busy) return;
                        if (status.trialEndsAt && !status.paidThrough) {
                          confirmAction(
                            "End your Pro trial?",
                            "You’ll return to Free immediately and this trial cannot be restarted. Your remaining credits stay available.",
                            {
                              cancelText: "Keep trial",
                              actionText: "End trial",
                              onConfirmPress: () =>
                                run(async () => {
                                  const ended = await endBillingTrial();
                                  if (!ended)
                                    throw new Error(
                                      "Couldn’t end your trial. Try again.",
                                    );
                                }),
                            },
                          );
                        } else
                          void run(() =>
                            manageStoreSubscription(
                              userId,
                              status.managementUrl,
                            ),
                          );
                      }}
                    >
                      {status.trialEndsAt && !status.paidThrough
                        ? "Cancel trial and return to Free"
                        : "Cancel plan"}
                    </Button>
                    <PText className="text-muted-foreground">
                      {status.trialEndsAt && !status.paidThrough
                        ? "This trial has no payment attached. End it now to return to Free."
                        : "Confirm cancellation in your app store. Paid access lasts through the current period, then your account returns to Free."}
                    </PText>
                  </View>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  loading={busy}
                  onPress={() =>
                    userId && void run(() => restoreBillingPurchases(userId))
                  }
                >
                  Restore purchases
                </Button>
              </View>
            </BillingTabPanel>
            <BillingTabPanel active={tab === "history"}>
              <View className="gap-3">
                {status.history.length === 0 ? (
                  <View className="items-center gap-3 rounded-3xl bg-card p-8">
                    <Icon
                      family="Feather"
                      name="clock"
                      size={28}
                      className="text-primary"
                    />
                    <PText className="text-lg">No credit activity yet</PText>
                  </View>
                ) : (
                  status.history.map((entry) => {
                    const change = entry.monthlyDelta + entry.purchasedDelta;
                    return (
                      <View
                        key={entry.id}
                        className="flex-row items-center gap-3 rounded-2xl bg-card p-4"
                      >
                        <View className="size-12.5 items-center justify-center rounded-full bg-primary/10">
                          <Icon
                            family="Feather"
                            name={change >= 0 ? "plus" : "arrow-up-right"}
                            size={20}
                            className="text-primary"
                          />
                        </View>
                        <View className="min-w-0 flex-1">
                          <PText
                            numberOfLines={1}
                            className="font-semibold text-xl"
                          >
                            {entry.description}
                          </PText>
                          <PText className="text-muted-foreground text-lg">
                            {formatBillingDate(entry.createdAt)}
                          </PText>
                        </View>
                        <PText className="font-semibold text-lg">
                          {change > 0 ? "+" : ""}
                          {change.toLocaleString()}
                        </PText>
                      </View>
                    );
                  })
                )}
              </View>
            </BillingTabPanel>
          </>
        )}
      </View>
    </AppWrapper>
  );
};
