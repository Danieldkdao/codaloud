import { pgEnum } from "drizzle-orm/pg-core";

export const authProviders = ["github", "google"] as const;
export type AuthProvider = (typeof authProviders)[number];

export const billingTiers = ["free", "tier_1", "tier_2"] as const;
export type BillingTier = (typeof billingTiers)[number];
export const billingTierEnum = pgEnum("billing_tier", billingTiers);
