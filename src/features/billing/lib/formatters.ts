import type { BillingTier } from "../billing-rules";

export type BillingTab = "usage" | "plans" | "subscription" | "history";

export const formatBillingTab = (tab: BillingTab) => {
  switch (tab) {
    case "usage":
      return "Usage";
    case "plans":
      return "Plans";
    case "subscription":
      return "Subscription";
    case "history":
      return "History";
  }
};

export const formatBillingTabIcon = (tab: BillingTab) => {
  switch (tab) {
    case "usage":
      return "activity" as const;
    case "plans":
      return "layers" as const;
    case "subscription":
      return "credit-card" as const;
    case "history":
      return "clock" as const;
  }
};

export const formatBillingTier = (tier: BillingTier) => {
  switch (tier) {
    case "free":
      return "Free";
    case "tier_1":
      return "Pro";
    case "tier_2":
      return "Premium";
  }
};

export const formatBillingDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

export const formatCreditChange = (amount: number) =>
  `${amount > 0 ? "+" : ""}${amount.toLocaleString()} credits`;
