import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  BillingAccountTable,
  CreditEntryTable,
  CreditTopupTable,
  UserTable,
} from "@/db/cloud/schema";

const mocks = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/cloud/db", () => ({
  get db() {
    return mocks.db;
  },
}));
vi.mock("../revenuecat-server", () => ({
  getRevenueCatSubscriber: async () => null,
  selectActiveSubscription: () => null,
}));
import {
  grantVerifiedTopup,
  refundVerifiedTopup,
  transferPurchasedCredits,
} from "../server/billing-service";

const pg = new PGlite();
const database = drizzle(pg);
const previous = "00000000-0000-4000-8000-000000000001";
const next = "00000000-0000-4000-8000-000000000002";
const third = "00000000-0000-4000-8000-000000000003";
const purchase = JSON.stringify(["APP_STORE", "purchase-1"]);
const balance = async (userId: string, billingDatabase = database) => {
  const [existingBillingAccount] = await billingDatabase
    .select()
    .from(BillingAccountTable)
    .where(eq(BillingAccountTable.userId, userId));
  return {
    monthly: existingBillingAccount.monthlyCredits,
    purchased: existingBillingAccount.purchasedCredits,
  };
};

beforeAll(async () => {
  mocks.db = database;
  await migrate(database, { migrationsFolder: "src/db/cloud/migrations" });
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await database.delete(UserTable);
  await database.insert(UserTable).values(
    [previous, next, third].map((id) => ({
      id,
      name: "Test user",
      email: `${id}@test.invalid`,
    })),
  );
});

it("moves only purchased balances and records balanced transfer entries once", async () => {
  await grantVerifiedTopup(previous, "evt-1", 100, purchase);
  await grantVerifiedTopup(
    next,
    "evt-2",
    200,
    JSON.stringify(["APP_STORE", "purchase-2"]),
  );
  await transferPurchasedCredits(
    "transfer-1",
    [previous, previous, next],
    next,
  );
  expect(await balance(previous)).toEqual({ monthly: 50, purchased: 0 });
  expect(await balance(next)).toEqual({ monthly: 50, purchased: 300 });
  const existingTransferCreditEntries = await database
    .select()
    .from(CreditEntryTable)
    .where(eq(CreditEntryTable.kind, "transfer"));
  expect(
    existingTransferCreditEntries
      .map((entry) => entry.purchasedDelta)
      .sort((a, b) => a - b),
  ).toEqual([-100, 100]);
  await grantVerifiedTopup(
    previous,
    "evt-3",
    100,
    JSON.stringify(["APP_STORE", "purchase-3"]),
  );
  await transferPurchasedCredits("transfer-1", [previous], next);
  expect(await balance(previous)).toEqual({ monthly: 50, purchased: 100 });
  expect(await balance(next)).toEqual({ monthly: 50, purchased: 300 });
});

it("remembers a transfer with no purchased balance so a retry cannot move later purchases", async () => {
  await transferPurchasedCredits("empty-transfer", [previous], next);
  await grantVerifiedTopup(previous, "later", 100, purchase);
  await transferPurchasedCredits("empty-transfer", [previous], next);
  expect((await balance(previous)).purchased).toBe(100);
  expect((await balance(next)).purchased).toBe(0);
});

it("rolls back every account when one transfer source is unavailable", async () => {
  await grantVerifiedTopup(previous, "evt-1", 100, purchase);
  await database.delete(UserTable).where(eq(UserTable.id, third));
  await expect(
    transferPurchasedCredits("failed-transfer", [previous, third], next),
  ).rejects.toThrow();
  expect((await balance(previous)).purchased).toBe(100);
  await database
    .insert(UserTable)
    .values({ id: third, name: "Restored", email: "restored@test.invalid" });
  await transferPurchasedCredits("failed-transfer", [previous, third], next);
  expect((await balance(next)).purchased).toBe(100);
});

it("deduplicates purchase events by store transaction across account IDs", async () => {
  await Promise.all([
    grantVerifiedTopup(previous, "evt-1", 100, purchase),
    grantVerifiedTopup(next, "evt-duplicate", 100, purchase),
  ]);
  const existingBillingAccounts = await database
    .select()
    .from(BillingAccountTable);
  expect(
    existingBillingAccounts.reduce(
      (total, existingBillingAccount) =>
        total + existingBillingAccount.purchasedCredits,
      0,
    ),
  ).toBe(100);
});

it("removes a refunded grant once without altering monthly credits", async () => {
  await grantVerifiedTopup(previous, "evt-1", 100, purchase);
  await grantVerifiedTopup(
    previous,
    "evt-2",
    200,
    JSON.stringify(["APP_STORE", "purchase-2"]),
  );
  await refundVerifiedTopup(previous, "refund-1", 100, purchase);
  await refundVerifiedTopup(previous, "refund-duplicate", 100, purchase);
  await grantVerifiedTopup(previous, "purchase-retry", 100, purchase);
  expect(await balance(previous)).toEqual({ monthly: 50, purchased: 200 });
  const existingRefundCreditEntries = await database
    .select()
    .from(CreditEntryTable)
    .where(eq(CreditEntryTable.kind, "refund"));
  expect(existingRefundCreditEntries).toHaveLength(1);
  expect(existingRefundCreditEntries[0].purchasedDelta).toBe(-100);
});

it("refunds the current owner after successive transfers even with the original user ID", async () => {
  await grantVerifiedTopup(previous, "evt-1", 100, purchase);
  await transferPurchasedCredits("transfer-1", [previous], next);
  await transferPurchasedCredits("transfer-2", [next], third);
  await refundVerifiedTopup(previous, "refund-1", 100, purchase);
  expect((await balance(previous)).purchased).toBe(0);
  expect((await balance(next)).purchased).toBe(0);
  expect((await balance(third)).purchased).toBe(0);
});

it("remembers refunds delivered before purchases without removing unrelated credits", async () => {
  await grantVerifiedTopup(
    previous,
    "unrelated",
    200,
    JSON.stringify(["APP_STORE", "other"]),
  );
  await refundVerifiedTopup(previous, "early-refund", 100, purchase);
  await grantVerifiedTopup(previous, "late-purchase", 100, purchase);
  expect((await balance(previous)).purchased).toBe(200);
});

it("clamps a spent refunded grant at zero and remembers it when new credits arrive", async () => {
  await grantVerifiedTopup(previous, "evt-1", 100, purchase);
  await database
    .update(BillingAccountTable)
    .set({ purchasedCredits: 20 })
    .where(eq(BillingAccountTable.userId, previous));
  await refundVerifiedTopup(previous, "refund-1", 100, purchase);
  expect(await balance(previous)).toEqual({ monthly: 50, purchased: 0 });
  await grantVerifiedTopup(
    previous,
    "evt-2",
    200,
    JSON.stringify(["APP_STORE", "other"]),
  );
  await refundVerifiedTopup(previous, "refund-retry", 100, purchase);
  expect((await balance(previous)).purchased).toBe(200);
});

it("does not grant a legacy event twice when it acquires transaction metadata", async () => {
  await grantVerifiedTopup(previous, "legacy", 100);
  await grantVerifiedTopup(previous, "legacy", 100, purchase);
  await refundVerifiedTopup(previous, "refund-1", 100, purchase);
  expect((await balance(previous)).purchased).toBe(0);
});

it("imports an installed legacy grant and preserves its event ID and current owner on purchase replay", async () => {
  const legacyPg = new PGlite();
  const legacyDatabase = drizzle(legacyPg);
  const legacyEventId = "evt:legacy_0002";
  const migrations = readMigrationFiles({
    migrationsFolder: "src/db/cloud/migrations",
  });
  try {
    for (const migration of migrations.slice(0, 2))
      await legacyPg.exec(migration.sql.join("\n"));
    await legacyDatabase.insert(UserTable).values(
      [previous, next].map((id) => ({
        id,
        name: "Legacy user",
        email: `${id}@test.invalid`,
      })),
    );
    const anchor = new Date("2026-09-01T00:00:00.000Z");
    await legacyDatabase.insert(BillingAccountTable).values({
      userId: previous,
      accountAnchor: anchor,
      cycleAnchor: anchor,
      purchasedCredits: 20,
    });
    await legacyDatabase.insert(CreditEntryTable).values({
      userId: previous,
      key: `revenuecat:${legacyEventId}`,
      kind: "topup",
      purchasedDelta: 100,
      description: "100 purchased credits",
    });

    await legacyPg.exec(migrations[2].sql.join("\n"));
    const [existingLegacyTopup] = await legacyDatabase
      .select()
      .from(CreditTopupTable);
    expect(existingLegacyTopup).toMatchObject({
      key: `legacy:${legacyEventId}`,
      eventId: legacyEventId,
      userId: previous,
      credits: 100,
      refundedAt: null,
    });
    expect(await balance(previous, legacyDatabase)).toEqual({
      monthly: 50,
      purchased: 20,
    });

    mocks.db = legacyDatabase;
    await transferPurchasedCredits("legacy-transfer", [previous], next);
    await grantVerifiedTopup(previous, legacyEventId, 100, purchase);
    await grantVerifiedTopup(previous, legacyEventId, 100, purchase);
    const existingReplayedTopups = await legacyDatabase
      .select()
      .from(CreditTopupTable);
    expect(existingReplayedTopups).toHaveLength(1);
    expect(existingReplayedTopups[0]).toMatchObject({
      key: purchase,
      eventId: legacyEventId,
      userId: next,
      credits: 100,
      refundedAt: null,
    });
    expect(await balance(previous, legacyDatabase)).toEqual({
      monthly: 50,
      purchased: 0,
    });
    expect(await balance(next, legacyDatabase)).toEqual({
      monthly: 50,
      purchased: 20,
    });
    await refundVerifiedTopup(previous, "legacy-refund", 100, purchase);
    expect(await balance(next, legacyDatabase)).toEqual({
      monthly: 50,
      purchased: 0,
    });
  } finally {
    mocks.db = database;
    await legacyPg.close();
  }
});

it("reconciles a legacy purchase replay after a refund and transfer", async () => {
  await grantVerifiedTopup(previous, "legacy", 100);
  await transferPurchasedCredits("transfer-1", [previous], next);
  await refundVerifiedTopup(previous, "early-refund", 100, purchase);
  await grantVerifiedTopup(previous, "legacy", 100, purchase);
  expect((await balance(next)).purchased).toBe(0);
  await refundVerifiedTopup(previous, "refund-retry", 100, purchase);
  expect((await balance(next)).purchased).toBe(0);
});
