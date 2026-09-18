import { relations, sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const WorkspaceTable = sqliteTable("workspace", {
  id: integer("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  gitAuthorName: text("git_author_name"),
  gitAuthorEmail: text("git_author_email"),
  hasEntered: integer("has_entered", { mode: "boolean" }).notNull().default(false),
}, (table) => [check("workspace_singleton", sql`${table.id} = 1`)]);

export const workspaceRelations = relations(WorkspaceTable, () => ({}));
export type WorkspaceSelectData = typeof WorkspaceTable.$inferSelect;
export type WorkspaceInsertData = typeof WorkspaceTable.$inferInsert;
