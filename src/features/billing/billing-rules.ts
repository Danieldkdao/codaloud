export type BillingTier = "free" | "tier_1" | "tier_2";

export type CreditState = {
  tier: BillingTier;
  monthlyCredits: number;
  purchasedCredits: number;
  monthlyAllowance: number;
  accountAnchor: string;
  cycleAnchor: string;
  cycleIndex: number;
  trialUsed: boolean;
  trialEndsAt: string | null;
  paidThrough: string | null;
};

export const canBuyCreditTopups = (
  state:
    | Pick<CreditState, "tier" | "paidThrough" | "trialEndsAt">
    | null
    | undefined,
  now = Date.now(),
) => {
  if (!state || state.tier === "free") return false;
  return (
    (state.paidThrough !== null && Date.parse(state.paidThrough) > now) ||
    (state.trialEndsAt !== null && Date.parse(state.trialEndsAt) > now)
  );
};

export const allowanceForTier = (tier: BillingTier) => {
  switch (tier) {
    case "free":
      return 50;
    case "tier_1":
      return 200;
    case "tier_2":
      return 1000;
  }
};

export const addBillingMonth = (anchor: string, months: number) => {
  const date = new Date(anchor);
  if (!Number.isInteger(months) || months < 0 || Number.isNaN(date.getTime()))
    throw new Error("Invalid billing period");
  const day = date.getUTCDate();
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
};

export const startTrial = (state: CreditState, now: string): CreditState => {
  if (state.trialUsed || state.tier !== "free")
    throw new Error("Trial is unavailable");
  const ends = new Date(now);
  if (Number.isNaN(ends.getTime())) throw new Error("Invalid trial date");
  ends.setUTCDate(ends.getUTCDate() + 3);
  return {
    ...state,
    tier: "tier_1",
    monthlyCredits: allowanceForTier("tier_1"),
    monthlyAllowance: allowanceForTier("tier_1"),
    trialUsed: true,
    trialEndsAt: ends.toISOString(),
  };
};

export const endTrial = (state: CreditState): CreditState => {
  if (state.paidThrough)
    throw new Error("Manage this subscription in your app store.");
  if (!state.trialEndsAt) return state;
  return { ...state, tier: "free", monthlyAllowance: 50, trialEndsAt: null };
};

export const startPaidPeriod = (
  state: CreditState,
  tier: Exclude<BillingTier, "free">,
  startsAt: string,
  paidThrough: string,
): CreditState => {
  if (new Date(paidThrough).getTime() <= new Date(startsAt).getTime())
    throw new Error("Invalid paid period");
  const isUpgrade =
    state.tier === "tier_1" &&
    tier === "tier_2" &&
    (state.paidThrough === null ||
      new Date(startsAt) < new Date(state.paidThrough));
  const allowance = allowanceForTier(tier);
  return {
    ...state,
    tier,
    monthlyCredits: allowance + (isUpgrade ? state.monthlyCredits : 0),
    monthlyAllowance: allowance,
    cycleAnchor: startsAt,
    cycleIndex: 0,
    trialEndsAt: null,
    paidThrough,
  };
};

export const advanceMonthlyCredits = (
  state: CreditState,
  now: string,
): CreditState => {
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(nowMs)) throw new Error("Invalid billing date");
  if (state.trialEndsAt && nowMs >= new Date(state.trialEndsAt).getTime()) {
    return advanceMonthlyCredits(
      {
        ...state,
        tier: "free",
        monthlyAllowance: 50,
        trialEndsAt: null,
      },
      now,
    );
  }
  if (state.paidThrough && nowMs >= new Date(state.paidThrough).getTime()) {
    const accountAnchor = state.accountAnchor;
    const cycleIndex = billingCycleIndex(accountAnchor, nowMs);
    return {
      ...state,
      tier: "free",
      monthlyCredits: 0,
      monthlyAllowance: 50,
      cycleAnchor: accountAnchor,
      cycleIndex,
      paidThrough: null,
    };
  }
  // Trial credits keep the account's Free-cycle expiry date.
  const nextIndex = billingCycleIndex(state.cycleAnchor, nowMs);
  if (nextIndex <= state.cycleIndex) return state;
  return {
    ...state,
    cycleIndex: nextIndex,
    monthlyCredits: state.monthlyAllowance,
  };
};

const billingCycleIndex = (anchor: string, nowMs: number) => {
  const start = new Date(anchor);
  if (nowMs < start.getTime()) return 0;
  const now = new Date(nowMs);
  let index =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    start.getUTCMonth();
  if (new Date(addBillingMonth(anchor, index)).getTime() > nowMs) index--;
  return Math.max(0, index);
};

export const spendCredits = (
  state: CreditState,
  amount: number,
): CreditState => {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid credit amount");
  if (state.monthlyCredits + state.purchasedCredits < amount)
    throw new Error("Insufficient credits");
  const monthlySpent = Math.min(state.monthlyCredits, amount);
  return {
    ...state,
    monthlyCredits: state.monthlyCredits - monthlySpent,
    purchasedCredits: state.purchasedCredits - (amount - monthlySpent),
  };
};
