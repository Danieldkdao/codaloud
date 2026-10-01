import { serverEnv } from "@/data/env/server";
import type { BillingTier } from "./billing-rules";

type Subscription = {
  tier: Exclude<BillingTier, "free">;
  productId: string;
  purchaseDate: string;
  expiresAt: string;
  managementUrl: string | null;
  willRenew: boolean;
  billingPeriod: "monthly" | "yearly";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const tierForProduct = (productId: string): Subscription["tier"] | null => {
  if (
    /^codaloud(?:\.tier\.1\.(?:monthly|yearly)|_tier_1:(?:monthly|yearly))$/.test(
      productId,
    )
  )
    return "tier_1";
  if (
    /^codaloud(?:\.tier\.2\.(?:monthly|yearly)|_tier_2:(?:monthly|yearly))$/.test(
      productId,
    )
  )
    return "tier_2";
  return null;
};

export const selectActiveSubscription = (
  value: unknown,
  now: string,
): Subscription | null => {
  if (
    !isRecord(value) ||
    !isRecord(value.entitlements) ||
    !isRecord(value.subscriptions)
  )
    return null;
  const entitlement = value.entitlements.paid;
  if (
    !isRecord(entitlement) ||
    typeof entitlement.product_identifier !== "string"
  )
    return null;
  const productId = entitlement.product_identifier;
  const tier = tierForProduct(productId);
  const subscription = value.subscriptions[productId];
  if (!tier || !isRecord(subscription) || subscription.refunded_at) return null;
  const expiresAt = subscription.expires_date;
  const purchaseDate = subscription.purchase_date;
  if (
    typeof expiresAt !== "string" ||
    typeof purchaseDate !== "string" ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    !Number.isFinite(Date.parse(purchaseDate)) ||
    Date.parse(expiresAt) <= Date.parse(now)
  )
    return null;
  return {
    tier,
    productId,
    purchaseDate,
    expiresAt,
    managementUrl:
      typeof value.management_url === "string" ? value.management_url : null,
    willRenew:
      !subscription.unsubscribe_detected_at &&
      !subscription.billing_issues_detected_at,
    billingPeriod: productId.endsWith("yearly") ? "yearly" : "monthly",
  };
};

export const getRevenueCatSubscriber = async (userId: string) => {
  const key = serverEnv.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error("RevenueCat verification unavailable");
  const payload: unknown = await response.json();
  return isRecord(payload) ? payload.subscriber : null;
};

export type VerifiedSubscription = Subscription;
