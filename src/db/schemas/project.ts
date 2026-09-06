import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "../helpers";
import { projectSetupStatusEnum } from "../shared";
import { user } from "./user";

export const ProjectTable = pgTable(
  "projects",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sandboxId: text("sandbox_id").unique(),
    setupStatus: projectSetupStatusEnum("setup_status").default("pending").notNull(),
    setupError: text("setup_error"),
    githubRepositoryId: text("github_repository_id"),
    lastOpenedFilePath: text("last_opened_file_path"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("projects_user_id_updated_at_idx").on(table.userId, table.updatedAt.desc()),
    check("projects_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "projects_ready_has_sandbox",
      sql`${table.setupStatus} <> 'ready' OR ${table.sandboxId} IS NOT NULL`,
    ),
  ],
);

export type ProjectSelectData = typeof ProjectTable.$inferSelect;
export type ProjectInsertData = typeof ProjectTable.$inferInsert;

export const projectRelations = relations(ProjectTable, ({ one }) => ({
  user: one(user, {
    fields: [ProjectTable.userId],
    references: [user.id],
  }),
}));
