import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { billingTierEnum } from "../shared";
import { UserTable } from "./user";
import { CreditEntryTable } from "./credit-entry";

export const BillingAccountTable = pgTable("billing_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  tier: billingTierEnum("tier").default("free").notNull(),
  monthlyCredits: integer("monthly_credits").default(50).notNull(),
  purchasedCredits: integer("purchased_credits").default(0).notNull(),
  monthlyAllowance: integer("monthly_allowance").default(50).notNull(),
  accountAnchor: timestamp("account_anchor", { withTimezone: true }).notNull(),
  cycleAnchor: timestamp("cycle_anchor", { withTimezone: true }).notNull(),
  cycleIndex: integer("cycle_index").default(0).notNull(),
  trialUsed: timestamp("trial_used_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  paidThrough: timestamp("paid_through", { withTimezone: true }),
  productId: text("product_id"),
  purchaseDate: timestamp("purchase_date", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const billingAccountRelations = relations(
  BillingAccountTable,
  ({ one, many }) => ({
    user: one(UserTable, {
      fields: [BillingAccountTable.userId],
      references: [UserTable.id],
    }),
    entries: many(CreditEntryTable),
  }),
);

export type BillingAccountSelectData = typeof BillingAccountTable.$inferSelect;
export type BillingAccountInsertData = typeof BillingAccountTable.$inferInsert;
