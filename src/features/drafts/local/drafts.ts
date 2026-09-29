import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db/local/db";
import {
  DraftTable,
  type DraftInsertData,
} from "@/db/local/schemas/draft";
import {
  draftResponseSchema,
  updateDraftSchema,
  type UpdateDraftSchema,
} from "../actions/draft-schemas";
import {
  draftParamsSchema,
  readDraftCursor,
  type DraftCursorSchema,
  type DraftParamsSchema,
  type DraftSortField,
} from "../lib/draft-params";
import { formatDraftSearchTitle } from "../lib/formatters";
import type { DraftPageData } from "../types";

const {
  searchTitle: _searchTitle,
  searchContent: _searchContent,
  ...draftColumns
} = getTableColumns(DraftTable);

const draftSortColumn = (field: DraftSortField) => {
  switch (field) {
    case "title":
      return DraftTable.searchTitle;
    case "createdAt":
      return DraftTable.createdAt;
    case "updatedAt":
      return DraftTable.updatedAt;
    default:
      return field satisfies never;
  }
};

export const localDraftStore = {
  read: (draftId: string) =>
    db
      .select(draftColumns)
      .from(DraftTable)
      .where(eq(DraftTable.id, draftId))
      .get() ?? null,

  list: (unsafeParams: Partial<DraftParamsSchema> = {}): DraftPageData => {
    const { search, sortBy, sortOrder, pageSize, cursor } =
      draftParamsSchema.parse(unsafeParams);
    const column = draftSortColumn(sortBy);
    const position = cursor ? readDraftCursor(cursor) : null;
    const after = sortOrder === "asc" ? gt : lt;
    const sort = sortOrder === "asc" ? asc : desc;
    const escapedSearch = search.replace(/[\\%_]/g, "\\$&").toLowerCase();
    const matching = `%${escapedSearch}%`;
    const existingDrafts = db
      .select(draftColumns)
      .from(DraftTable)
      .where(
        and(
          search
            ? or(
                sql`${DraftTable.searchTitle} LIKE ${matching} ESCAPE '\\'`,
                sql`${DraftTable.searchContent} LIKE ${matching} ESCAPE '\\'`,
              )
            : undefined,
          position
            ? or(
                after(column, position.value),
                and(eq(column, position.value), gt(DraftTable.id, position.id)),
              )
            : undefined,
        ),
      )
      .orderBy(sort(column), asc(DraftTable.id))
      .limit(pageSize + 1)
      .all();
    const drafts = existingDrafts.slice(0, pageSize);
    const lastDraft = drafts.at(-1);
    return {
      drafts,
      nextCursor:
        existingDrafts.length > pageSize && lastDraft
          ? JSON.stringify({
              version: 1,
              id: lastDraft.id,
              value:
                sortBy === "title"
                  ? formatDraftSearchTitle(lastDraft)
                  : lastDraft[sortBy],
              search,
              sortBy,
              sortOrder,
            } satisfies DraftCursorSchema)
          : null,
    };
  },

  insert: (unsafeDraft: Omit<DraftInsertData, "searchTitle" | "searchContent">) => {
    const draft = draftResponseSchema.parse(unsafeDraft);
    // SQLite folds case for ASCII only, so both search columns are folded here
    // and stay in sync with the displayed title and the raw content.
    const insertedDraft = db
      .insert(DraftTable)
      .values({
        ...draft,
        searchTitle: formatDraftSearchTitle(draft),
        searchContent: draft.content.toLowerCase(),
      })
      .returning(draftColumns)
      .get();
    return insertedDraft;
  },

  update: (draftId: string, unsafeInput: UpdateDraftSchema) => {
    const input = updateDraftSchema.parse(unsafeInput);
    const updatedDraft = db
      .update(DraftTable)
      .set({
        ...input,
        ...(input.filename !== undefined
          ? { searchTitle: formatDraftSearchTitle({ filename: input.filename }) }
          : {}),
        ...(input.content !== undefined
          ? { searchContent: input.content.toLowerCase() }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(DraftTable.id, draftId))
      .returning(draftColumns)
      .get();
    return updatedDraft ?? null;
  },

  remove: (draftId: string) => {
    const deletedDraft = db
      .delete(DraftTable)
      .where(eq(DraftTable.id, draftId))
      .returning(draftColumns)
      .get();
    return deletedDraft ?? null;
  },
};
