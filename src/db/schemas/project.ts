import { desc, sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "../helpers";
import { projectSetupStatuses } from "../shared";

// Repository contents live in the device filesystem; this table stores metadata.
export const ProjectTable = sqliteTable(
  "projects",
  {
    id,
    name: text("name").notNull(),
    searchName: text("search_name").notNull(),
    setupStatus: text("setup_status", { enum: projectSetupStatuses }).notNull(),
    setupError: text("setup_error"),
    githubRepositoryId: text("github_repository_id"),
    lastOpenedFilePath: text("last_opened_file_path"),
    lastOpenedAt: text("last_opened_at"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("projects_updated_at_idx").on(desc(table.updatedAt)),
    check("projects_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check(
      "projects_setup_status_valid",
      sql`${table.setupStatus} IN ('pending', 'running', 'ready', 'failed')`,
    ),
  ],
);

export type ProjectSelectData = typeof ProjectTable.$inferSelect;
export type ProjectInsertData = typeof ProjectTable.$inferInsert;
