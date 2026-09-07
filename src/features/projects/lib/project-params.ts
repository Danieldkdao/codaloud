import z from "zod";

import { paginationSchema } from "@/lib/schemas";

export const projectSortFields = ["name", "createdAt", "updatedAt"] as const;
export type ProjectSortField = (typeof projectSortFields)[number];

export const projectSortOrders = ["asc", "desc"] as const;
export type ProjectSortOrder = (typeof projectSortOrders)[number];

export const projectCursorSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  value: z.string().max(1000),
  search: z.string().max(200),
  sortBy: z.enum(projectSortFields),
  sortOrder: z.enum(projectSortOrders),
}).refine(
  (cursor) => cursor.sortBy === "name" || z.iso.datetime().safeParse(cursor.value).success,
  { message: "Invalid cursor timestamp.", path: ["value"] },
);
export type ProjectCursorSchema = z.infer<typeof projectCursorSchema>;

export const readProjectCursor = (token: string): ProjectCursorSchema | null => {
  if (token.length > 4096) return null;
  try {
    const result = projectCursorSchema.safeParse(JSON.parse(token));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const projectCursorTokenSchema = z.string().min(1).max(4096).refine(
  (token) => readProjectCursor(token) !== null,
  "Invalid project cursor. Start a new project search.",
);
export type ProjectCursorTokenSchema = z.infer<typeof projectCursorTokenSchema>;

export const projectParamsSchema = z
  .strictObject({
    search: paginationSchema.shape.search.default(""),
    sortBy: z.enum(projectSortFields).default("updatedAt"),
    sortOrder: z.enum(projectSortOrders).default("desc"),
    cursor: projectCursorTokenSchema.nullish(),
    pageSize: paginationSchema.shape.pageSize,
  })
  .superRefine(({ cursor, search, sortBy, sortOrder }, ctx) => {
    if (!cursor) return;
    const position = readProjectCursor(cursor);
    if (position && (
      position.search !== search || position.sortBy !== sortBy || position.sortOrder !== sortOrder
    )) {
      ctx.addIssue({ code: "custom", message: "Cursor does not match the current search and sort.", path: ["cursor"] });
    }
  });

export type ProjectParamsSchema = z.infer<typeof projectParamsSchema>;
