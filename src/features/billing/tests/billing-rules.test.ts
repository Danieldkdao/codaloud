import { describe, expect, it } from "vitest";
import {
  addBillingMonth,
  advanceMonthlyCredits,
  spendCredits,
  startPaidPeriod,
  startTrial,
  endTrial,
  canBuyCreditTopups,
  type CreditState,
} from "../billing-rules";

const free: CreditState = {
  tier: "free",
  monthlyCredits: 20,
  purchasedCredits: 15,
  monthlyAllowance: 50,
  accountAnchor: "2026-01-31T12:00:00.000Z",
  cycleAnchor: "2026-01-31T12:00:00.000Z",
  cycleIndex: 0,
  trialUsed: false,
  trialEndsAt: null,
  paidThrough: null,
};

describe("credit pack eligibility", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it.each([
    [
      "active trial",
      { tier: "tier_1", trialEndsAt: "2026-10-03T12:00:00Z" },
      true,
    ],
    [
      "active subscription",
      { tier: "tier_2", paidThrough: "2026-11-01T12:00:00Z" },
      true,
    ],
    [
      "expired trial",
      { tier: "tier_1", trialEndsAt: "2026-10-01T12:00:00Z" },
      false,
    ],
    [
      "expired subscription",
      { tier: "tier_1", paidThrough: "2026-09-30T12:00:00Z" },
      false,
    ],
    [
      "free account",
      { tier: "free", trialEndsAt: "2026-10-03T12:00:00Z" },
      false,
    ],
    ["missing entitlement", { tier: "tier_1" }, false],
    ["invalid expiry", { tier: "tier_1", paidThrough: "invalid" }, false],
  ] as const)("checks %s", (_, changes, expected) => {
    expect(canBuyCreditTopups({ ...free, ...changes }, now)).toBe(expected);
  });
  it("blocks missing billing status", () => {
    expect(canBuyCreditTopups(null, now)).toBe(false);
    expect(canBuyCreditTopups(undefined, now)).toBe(false);
  });
});

it("ends an app trial without regranting credits or allowing a second trial", () => {
  const trial = {
    ...startTrial(free, "2026-02-05T00:00:00.000Z"),
    monthlyCredits: 12,
  };
  expect(endTrial(trial)).toMatchObject({
    tier: "free",
    trialEndsAt: null,
    trialUsed: true,
    monthlyCredits: 12,
    purchasedCredits: 15,
  });
  expect(() =>
    startTrial(endTrial(trial), "2026-02-06T00:00:00.000Z"),
  ).toThrow();
  expect(endTrial({ ...trial, monthlyCredits: 190 }).monthlyCredits).toBe(190);
  expect(endTrial(free)).toEqual(free);
  expect(() =>
    endTrial(
      startPaidPeriod(
        free,
        "tier_1",
        "2026-02-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
      ),
    ),
  ).toThrow(/app store/);
});

describe("billing periods", () => {
  it("anchors monthly grants to the account or purchase date, including short months", () => {
    expect(addBillingMonth(free.cycleAnchor, 1)).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(addBillingMonth(free.cycleAnchor, 2)).toBe(
      "2026-03-31T12:00:00.000Z",
    );
    expect(
      advanceMonthlyCredits(free, "2026-03-31T12:00:00.000Z"),
    ).toMatchObject({
      cycleIndex: 2,
      monthlyCredits: 50,
      purchasedCredits: 15,
    });
  });

  it("starts a no-payment trial once and keeps leftover trial credits until the next free reset", () => {
    const trial = startTrial(free, "2026-02-05T00:00:00.000Z");
    expect(trial).toMatchObject({
      tier: "tier_1",
      monthlyCredits: 200,
      trialUsed: true,
    });
    expect(trial.trialEndsAt).toBe("2026-02-08T00:00:00.000Z");
    expect(() => startTrial(trial, "2026-02-06T00:00:00.000Z")).toThrow();
    expect(
      advanceMonthlyCredits(trial, "2026-02-09T00:00:00.000Z"),
    ).toMatchObject({
      tier: "free",
      monthlyCredits: 200,
      purchasedCredits: 15,
    });
    expect(
      advanceMonthlyCredits(trial, "2026-02-28T12:00:00.000Z"),
    ).toMatchObject({
      tier: "free",
      monthlyCredits: 50,
    });
  });

  it("grants a full new allowance plus unused monthly credits on an immediate upgrade", () => {
    const first = startPaidPeriod(
      free,
      "tier_1",
      "2026-02-10T12:00:00.000Z",
      "2026-03-10T12:00:00.000Z",
    );
    const upgrade = startPaidPeriod(
      { ...first, monthlyCredits: 72 },
      "tier_2",
      "2026-02-20T12:00:00.000Z",
      "2027-02-20T12:00:00.000Z",
    );
    expect(upgrade).toMatchObject({
      tier: "tier_2",
      monthlyCredits: 1072,
      purchasedCredits: 15,
      cycleAnchor: "2026-02-20T12:00:00.000Z",
    });
    expect(
      advanceMonthlyCredits(upgrade, "2026-03-20T12:00:00.000Z"),
    ).toMatchObject({
      monthlyCredits: 1000,
      purchasedCredits: 15,
    });
  });

  it("expires monthly credits after cancellation while preserving purchased credits", () => {
    const paid = startPaidPeriod(
      free,
      "tier_2",
      "2026-02-10T00:00:00.000Z",
      "2026-03-10T00:00:00.000Z",
    );
    expect(
      advanceMonthlyCredits(paid, "2026-03-10T00:00:00.000Z"),
    ).toMatchObject({
      tier: "free",
      monthlyCredits: 0,
      purchasedCredits: 15,
    });
  });
});

describe("spending", () => {
  it("uses monthly credits first and never permits debt", () => {
    expect(spendCredits(free, 25)).toMatchObject({
      monthlyCredits: 0,
      purchasedCredits: 10,
    });
    expect(() => spendCredits(free, 36)).toThrow("Insufficient credits");
    expect(() => spendCredits(free, -1)).toThrow();
  });
});
