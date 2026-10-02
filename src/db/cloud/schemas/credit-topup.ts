import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { UserTable } from "./user";

export const CreditTopupTable = pgTable(
  "credit_topups",
  {
    key: text("key").primaryKey(),
    eventId: text("event_id").unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    credits: integer("credits").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => [index("credit_topups_user_idx").on(table.userId)],
);

export const creditTopupRelations = relations(CreditTopupTable, ({ one }) => ({
  user: one(UserTable, {
    fields: [CreditTopupTable.userId],
    references: [UserTable.id],
  }),
}));
export type CreditTopupSelectData = typeof CreditTopupTable.$inferSelect;
export type CreditTopupInsertData = typeof CreditTopupTable.$inferInsert;
