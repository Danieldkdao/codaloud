import { relations } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { id } from "../helpers";

// Preserve the original development metadata as an audit trail. Authentication
// sessions and encrypted cloud credentials are deliberately not imported.
export const MigrationTable = sqliteTable("migration_imports", {
  id,
  sourceBranchId: text("source_branch_id").notNull(),
  importedAt: text("imported_at").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
});
export const migrationRelations = relations(MigrationTable, () => ({}));
export type MigrationSelectData = typeof MigrationTable.$inferSelect;
export type MigrationInsertData = typeof MigrationTable.$inferInsert;
