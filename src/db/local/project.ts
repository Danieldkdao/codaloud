import { desc, relations, sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projectSetupStatuses } from "../shared";

// Keep imported UUIDs and timestamp strings verbatim. Repository contents live
// in the device filesystem; sandboxId is retained only as migration provenance.
export const ProjectTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  searchName: text("search_name").notNull(),
  sandboxId: text("sandbox_id"),
  setupStatus: text("setup_status", { enum: projectSetupStatuses }).notNull(),
  setupError: text("setup_error"),
  githubRepositoryId: text("github_repository_id"),
  lastOpenedFilePath: text("last_opened_file_path"),
  lastOpenedAt: text("last_opened_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("projects_user_id_updated_at_idx").on(table.userId, desc(table.updatedAt)),
  check("projects_name_not_blank", sql`length(trim(${table.name})) > 0`),
  check("projects_setup_status_valid", sql`${table.setupStatus} IN ('pending', 'running', 'ready', 'failed')`),
]);

export type ProjectSelectData = typeof ProjectTable.$inferSelect;
export type ProjectInsertData = typeof ProjectTable.$inferInsert;
export const projectRelations = relations(ProjectTable, () => ({}));
