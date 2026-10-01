import { expect, it, vi } from "vitest";
import { selectActiveSubscription } from "../revenuecat-server";
import { creditsForTopup } from "../constants";

vi.mock("@/data/env/server", () => ({ serverEnv: {} }));

it("accepts only a currently active paid entitlement and known subscription product", () => {
  const subscriber = {
    entitlements: { paid: { product_identifier: "codaloud.tier.2.yearly", expires_date: "2027-01-01T00:00:00Z" } },
    subscriptions: { "codaloud.tier.2.yearly": { purchase_date: "2026-01-01T00:00:00Z", original_purchase_date: "2026-01-01T00:00:00Z", expires_date: "2027-01-01T00:00:00Z", refunded_at: null } },
    management_url: "https://apps.apple.com/account/subscriptions",
  };
  expect(selectActiveSubscription(subscriber, "2026-04-01T00:00:00Z")).toMatchObject({
    tier: "tier_2",
    productId: "codaloud.tier.2.yearly",
    willRenew: true,
    billingPeriod: "yearly",
    managementUrl: "https://apps.apple.com/account/subscriptions",
  });
  expect(selectActiveSubscription({ ...subscriber, subscriptions: { "codaloud.tier.2.yearly": { ...subscriber.subscriptions["codaloud.tier.2.yearly"], unsubscribe_detected_at: "2026-03-01T00:00:00Z" } } }, "2026-04-01T00:00:00Z")).toMatchObject({ willRenew: false });
  expect(selectActiveSubscription(subscriber, "2027-01-01T00:00:00Z")).toBeNull();
  expect(selectActiveSubscription({ ...subscriber, entitlements: {} }, "2026-04-01T00:00:00Z")).toBeNull();
  expect(selectActiveSubscription({ ...subscriber, subscriptions: { "codaloud.tier.2.yearly": { ...subscriber.subscriptions["codaloud.tier.2.yearly"], refunded_at: "2026-03-01T00:00:00Z" } } }, "2026-04-01T00:00:00Z")).toBeNull();
});

it("recognizes only configured top-up packs", () => {
  expect(creditsForTopup("codaloud.credits.500")).toBe(500);
  expect(creditsForTopup("codaloud.credits.999")).toBeNull();
  expect(creditsForTopup("codaloud.tier.1.monthly")).toBeNull();
});
