import { authClient } from "@/lib/auth/auth-client";
import { fetchBase } from "@/lib/utils";
import { z } from "zod";
import { billingTiers } from "@/db/cloud/shared";
import { billingPeriods } from "./constants";

const billingStatusSchema = z.object({
  tier: z.enum(billingTiers),
  monthlyCredits: z.number().int().nonnegative(),
  purchasedCredits: z.number().int().nonnegative(),
  monthlyAllowance: z.number().int().positive(),
  accountAnchor: z.string(),
  cycleAnchor: z.string(),
  cycleIndex: z.number().int().nonnegative(),
  trialUsed: z.boolean(),
  trialEndsAt: z.string().nullable(),
  paidThrough: z.string().nullable(),
  managementUrl: z.string().nullable(),
  willRenew: z.boolean(),
  billingPeriod: z.enum(billingPeriods).nullable(),
  history: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      description: z.string(),
      monthlyDelta: z.number(),
      purchasedDelta: z.number(),
      createdAt: z.string(),
    }),
  ),
});
export type BillingStatusSchema = z.infer<typeof billingStatusSchema>;

const requestBilling = async (method: "GET" | "POST" | "DELETE") => {
  try {
    const cookie = await authClient.getCookie();
    const response = await fetchBase("/api/billing", {
      method,
      credentials: "omit",
      headers: { Cookie: cookie ?? "" },
    });
    if (!response.ok) return null;
    const parsed = billingStatusSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const readBilling = () => requestBilling("GET");
export const startBillingTrial = () => requestBilling("POST");
export const endBillingTrial = () => requestBilling("DELETE");
