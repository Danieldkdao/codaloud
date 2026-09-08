import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "../helpers";
import {
  projectOperationKindEnum,
  projectOperationPhaseEnum,
  projectOperationStatusEnum,
} from "../shared";
import { account, user } from "./user";

export const ProjectOperationTable = pgTable(
  "project_operations",
  {
    id,
    // Historical identifier: cleanup records must survive project deletion.
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    kind: projectOperationKindEnum("kind").notNull(),
    status: projectOperationStatusEnum("status").default("queued").notNull(),
    phase: projectOperationPhaseEnum("phase").default("queued").notNull(),
    triggerRunId: text("trigger_run_id"),
    githubAccountId: uuid("github_account_id").references(() => account.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    nextDispatchAt: timestamp("next_dispatch_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    createdAt,
    updatedAt,
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("project_operations_project_id_created_at_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
    index("project_operations_user_id_idx").on(table.userId),
    index("project_operations_status_next_dispatch_at_idx").on(
      table.status,
      table.nextDispatchAt,
    ),
    check(
      "project_operations_dispatch_attempts_nonnegative",
      sql`${table.dispatchAttempts} >= 0`,
    ),
  ],
);

export type ProjectOperationSelectData = typeof ProjectOperationTable.$inferSelect;
export type ProjectOperationInsertData = typeof ProjectOperationTable.$inferInsert;

export const projectOperationRelations = relations(ProjectOperationTable, ({ one }) => ({
  user: one(user, {
    fields: [ProjectOperationTable.userId],
    references: [user.id],
  }),
  githubAccount: one(account, {
    fields: [ProjectOperationTable.githubAccountId],
    references: [account.id],
  }),
}));
