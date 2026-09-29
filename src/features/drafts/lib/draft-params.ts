import { z } from "zod";

import { paginationSchema } from "@/lib/schemas";
import { sortOrders, type SortOrder } from "@/lib/constants";

export { sortOrders };
export type { SortOrder };

export const draftSortFields = ["title", "createdAt", "updatedAt"] as const;
export type DraftSortField = (typeof draftSortFields)[number];

export const draftCursorSchema = z
  .strictObject({
    version: z.literal(1),
    id: z.uuid(),
    value: z.string().max(1000),
    search: z.string().max(200),
    sortBy: z.enum(draftSortFields),
    sortOrder: z.enum(sortOrders),
  })
  .refine(
    (cursor) =>
      cursor.sortBy === "title" ||
      z.iso.datetime().safeParse(cursor.value).success,
    { message: "Invalid cursor timestamp.", path: ["value"] },
  );
export type DraftCursorSchema = z.infer<typeof draftCursorSchema>;

export const readDraftCursor = (token: string): DraftCursorSchema | null => {
  if (token.length > 4096) return null;
  try {
    const result = draftCursorSchema.safeParse(JSON.parse(token));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const draftCursorTokenSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (token) => readDraftCursor(token) !== null,
    "Invalid draft cursor. Start a new draft search.",
  );
export type DraftCursorTokenSchema = z.infer<typeof draftCursorTokenSchema>;

export const draftParamsSchema = z
  .strictObject({
    search: paginationSchema.shape.search.default(""),
    sortBy: z.enum(draftSortFields).default("updatedAt"),
    sortOrder: z.enum(sortOrders).default("desc"),
    cursor: draftCursorTokenSchema.nullish(),
    pageSize: paginationSchema.shape.pageSize,
  })
  .superRefine(({ cursor, search, sortBy, sortOrder }, ctx) => {
    if (!cursor) return;
    const position = readDraftCursor(cursor);
    if (
      position &&
      (position.search !== search ||
        position.sortBy !== sortBy ||
        position.sortOrder !== sortOrder)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Cursor does not match the current search and sort.",
        path: ["cursor"],
      });
    }
  });

export type DraftParamsSchema = z.infer<typeof draftParamsSchema>;
