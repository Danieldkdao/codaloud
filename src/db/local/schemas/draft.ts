import { desc, sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "../helpers";

export const DraftTable = sqliteTable(
  "drafts",
  {
    id,
    filename: text("filename"),
    searchTitle: text("search_title").notNull(),
    content: text("content").notNull(),
    searchContent: text("search_content").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("drafts_updated_at_idx").on(desc(table.updatedAt)),
    index("drafts_created_at_idx").on(desc(table.createdAt)),
    check(
      "drafts_filename_not_blank",
      sql`${table.filename} IS NULL OR length(trim(${table.filename})) > 0`,
    ),
    // Saving requires content or a filename, so an empty unnamed draft can never
    // be persisted even if a caller skips the schema check.
    check(
      "drafts_saved_needs_content_or_filename",
      sql`length(${table.content}) > 0 OR ${table.filename} IS NOT NULL`,
    ),
  ],
);

export type DraftSelectData = typeof DraftTable.$inferSelect;
export type DraftInsertData = typeof DraftTable.$inferInsert;
