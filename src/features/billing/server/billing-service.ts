import { and, desc, eq, sql } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/cloud/db";
import {
  BillingAccountTable,
  CreditEntryTable,
  UserTable,
} from "@/db/cloud/schema";
import {
  advanceMonthlyCredits,
  spendCredits,
  startPaidPeriod,
  startTrial,
  endTrial,
  type CreditState,
} from "../billing-rules";
import {
  getRevenueCatSubscriber,
  selectActiveSubscription,
  type VerifiedSubscription,
} from "../revenuecat-server";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
  }
}

const toState = (
  row: typeof BillingAccountTable.$inferSelect,
): CreditState => ({
  tier: row.tier,
  monthlyCredits: row.monthlyCredits,
  purchasedCredits: row.purchasedCredits,
  monthlyAllowance: row.monthlyAllowance,
  accountAnchor: row.accountAnchor.toISOString(),
  cycleAnchor: row.cycleAnchor.toISOString(),
  cycleIndex: row.cycleIndex,
  trialUsed: Boolean(row.trialUsed),
  trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
  paidThrough: row.paidThrough?.toISOString() ?? null,
});

const saveState = async (
  tx: DbTransaction,
  userId: string,
  state: CreditState,
  subscription?: VerifiedSubscription | null,
) => {
  await tx
    .update(BillingAccountTable)
    .set({
      tier: state.tier,
      monthlyCredits: state.monthlyCredits,
      purchasedCredits: state.purchasedCredits,
      monthlyAllowance: state.monthlyAllowance,
      cycleAnchor: new Date(state.cycleAnchor),
      cycleIndex: state.cycleIndex,
      trialUsed: state.trialUsed
        ? sql`COALESCE(${BillingAccountTable.trialUsed}, now())`
        : null,
      trialEndsAt: state.trialEndsAt ? new Date(state.trialEndsAt) : null,
      paidThrough: state.paidThrough ? new Date(state.paidThrough) : null,
      ...(subscription
        ? {
            productId: subscription.productId,
            purchaseDate: new Date(subscription.purchaseDate),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(BillingAccountTable.userId, userId));
};

const addEntry = async (
  tx: DbTransaction,
  userId: string,
  key: string,
  kind: string,
  before: CreditState,
  after: CreditState,
  description: string,
) => {
  if (
    before.monthlyCredits === after.monthlyCredits &&
    before.purchasedCredits === after.purchasedCredits
  )
    return;
  await tx
    .insert(CreditEntryTable)
    .values({
      userId,
      key,
      kind,
      description,
      monthlyDelta: after.monthlyCredits - before.monthlyCredits,
      purchasedDelta: after.purchasedCredits - before.purchasedCredits,
    })
    .onConflictDoNothing();
};

const lockedAccount = async (tx: DbTransaction, userId: string) => {
  const [existingUser] = await tx
    .select({ createdAt: UserTable.createdAt })
    .from(UserTable)
    .where(eq(UserTable.id, userId));
  if (!existingUser) throw new Error("Account unavailable");
  await tx
    .insert(BillingAccountTable)
    .values({
      userId,
      accountAnchor: existingUser.createdAt,
      cycleAnchor: existingUser.createdAt,
    })
    .onConflictDoNothing();
  await tx.execute(
    sql`SELECT user_id FROM billing_accounts WHERE user_id = ${userId} FOR UPDATE`,
  );
  const [existingBillingAccount] = await tx
    .select()
    .from(BillingAccountTable)
    .where(eq(BillingAccountTable.userId, userId));
  if (!existingBillingAccount) throw new Error("Billing account unavailable");
  const [initialEntry] = await tx
    .select({ id: CreditEntryTable.id })
    .from(CreditEntryTable)
    .where(eq(CreditEntryTable.key, `initial:${userId}`));
  if (!initialEntry)
    await tx
      .insert(CreditEntryTable)
      .values({
        userId,
        key: `initial:${userId}`,
        kind: "grant",
        monthlyDelta: 50,
        description: "Initial Free credits",
      })
      .onConflictDoNothing();
  return existingBillingAccount;
};

const reconcile = async (
  tx: DbTransaction,
  userId: string,
  row: typeof BillingAccountTable.$inferSelect,
  subscription: VerifiedSubscription | null,
  now: string,
) => {
  const before = toState(row);
  let after = before;
  let key = "";
  let kind = "renewal";
  let description = "Monthly credits refreshed";
  if (
    subscription &&
    (row.productId !== subscription.productId ||
      row.purchaseDate?.toISOString() !==
        new Date(subscription.purchaseDate).toISOString())
  ) {
    after = startPaidPeriod(
      before,
      subscription.tier,
      subscription.purchaseDate,
      subscription.expiresAt,
    );
    key = `subscription:${userId}:${subscription.productId}:${subscription.purchaseDate}`;
    kind = "subscription";
    description = `${after.monthlyAllowance} monthly credits for the paid plan`;
  } else {
    const current =
      subscription && before.paidThrough !== subscription.expiresAt
        ? { ...before, paidThrough: subscription.expiresAt }
        : before;
    after = advanceMonthlyCredits(
      !subscription && before.paidThrough
        ? { ...current, paidThrough: now }
        : current,
      now,
    );
    key = `cycle:${userId}:${after.cycleAnchor}:${after.cycleIndex}:${after.tier}`;
    if (after.tier === "free" && before.tier !== "free") {
      kind = "expiration";
      description = "Paid or trial credits expired";
    }
  }
  if (
    JSON.stringify(after) !== JSON.stringify(before) ||
    (subscription && row.productId !== subscription.productId)
  ) {
    await saveState(tx, userId, after, subscription);
    await addEntry(tx, userId, key, kind, before, after, description);
  }
  return after;
};

const verifiedSubscription = async (userId: string, now: string) => {
  const subscriber = await getRevenueCatSubscriber(userId);
  return selectActiveSubscription(subscriber, now);
};

export const readBillingStatus = async (userId: string) => {
  const now = new Date().toISOString();
  const subscription = await verifiedSubscription(userId, now);
  const state = await db.transaction(async (tx) => {
    const row = await lockedAccount(tx, userId);
    return reconcile(tx, userId, row, subscription, now);
  });
  const entries = await db
    .select()
    .from(CreditEntryTable)
    .where(eq(CreditEntryTable.userId, userId))
    .orderBy(desc(CreditEntryTable.createdAt))
    .limit(100);
  return {
    ...state,
    managementUrl: subscription?.managementUrl ?? null,
    willRenew: subscription?.willRenew ?? false,
    billingPeriod: subscription?.billingPeriod ?? null,
    history: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      description: entry.description,
      monthlyDelta: entry.monthlyDelta,
      purchasedDelta: entry.purchasedDelta,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
};

export const beginBillingTrial = async (userId: string) => {
  const now = new Date().toISOString();
  const subscription = await verifiedSubscription(userId, now);
  if (subscription) throw new Error("Trial is unavailable");
  await db.transaction(async (tx) => {
    const row = await lockedAccount(tx, userId);
    const before = await reconcile(tx, userId, row, null, now);
    const after = startTrial(before, now);
    await saveState(tx, userId, after);
    await addEntry(
      tx,
      userId,
      `trial:${userId}`,
      "trial",
      before,
      after,
      "Three-day trial credits",
    );
  });
  return readBillingStatus(userId);
};

export const endBillingTrial = async (userId: string) => {
  const now = new Date().toISOString();
  const subscription = await verifiedSubscription(userId, now);
  if (subscription)
    throw new Error("Manage this subscription in your app store.");
  await db.transaction(async (tx) => {
    const row = await lockedAccount(tx, userId);
    const before = await reconcile(tx, userId, row, null, now);
    await saveState(tx, userId, endTrial(before));
  });
  return readBillingStatus(userId);
};

export const requireAvailableCredits = async (userId: string, minimum = 1) => {
  if (!Number.isSafeInteger(minimum) || minimum < 1)
    throw new Error("Invalid credit minimum");
  const status = await readBillingStatus(userId);
  if (status.monthlyCredits + status.purchasedCredits < minimum)
    throw new InsufficientCreditsError();
  return status;
};

export const chargeCredits = async (
  userId: string,
  key: string,
  amount: number,
  description: string,
) => {
  if (!/^[a-zA-Z0-9:_-]{1,220}$/.test(key))
    throw new Error("Invalid charge key");
  const now = new Date().toISOString();
  const subscription = await verifiedSubscription(userId, now);
  return db.transaction(async (tx) => {
    const row = await lockedAccount(tx, userId);
    const before = await reconcile(tx, userId, row, subscription, now);
    const [existingEntry] = await tx
      .select({ id: CreditEntryTable.id })
      .from(CreditEntryTable)
      .where(
        and(
          eq(CreditEntryTable.userId, userId),
          eq(CreditEntryTable.key, `usage:${userId}:${key}`),
        ),
      );
    if (existingEntry) return before;
    let after: CreditState;
    try {
      after = spendCredits(before, amount);
    } catch (error) {
      if (error instanceof Error && error.message === "Insufficient credits")
        throw new InsufficientCreditsError();
      throw error;
    }
    await saveState(tx, userId, after);
    await addEntry(
      tx,
      userId,
      `usage:${userId}:${key}`,
      "usage",
      before,
      after,
      description,
    );
    return after;
  });
};

export const grantVerifiedTopup = async (
  userId: string,
  eventId: string,
  credits: number,
) => {
  if (!Number.isSafeInteger(credits) || credits <= 0)
    throw new Error("Invalid top-up");
  await db.transaction(async (tx) => {
    const row = await lockedAccount(tx, userId);
    const before = toState(row);
    const key = `revenuecat:${eventId}`;
    const [existingEntry] = await tx
      .select({ id: CreditEntryTable.id })
      .from(CreditEntryTable)
      .where(eq(CreditEntryTable.key, key));
    if (existingEntry) return;
    const after = {
      ...before,
      purchasedCredits: before.purchasedCredits + credits,
    };
    await saveState(tx, userId, after);
    await addEntry(
      tx,
      userId,
      key,
      "topup",
      before,
      after,
      `${credits} purchased credits`,
    );
  });
};
