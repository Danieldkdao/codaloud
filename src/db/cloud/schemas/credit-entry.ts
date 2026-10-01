import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { UserTable } from "./user";

export const CreditEntryTable = pgTable(
  "credit_entries",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    kind: text("kind").notNull(),
    monthlyDelta: integer("monthly_delta").default(0).notNull(),
    purchasedDelta: integer("purchased_delta").default(0).notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("credit_entries_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const creditEntryRelations = relations(CreditEntryTable, ({ one }) => ({
  user: one(UserTable, {
    fields: [CreditEntryTable.userId],
    references: [UserTable.id],
  }),
}));

export type CreditEntrySelectData = typeof CreditEntryTable.$inferSelect;
export type CreditEntryInsertData = typeof CreditEntryTable.$inferInsert;
