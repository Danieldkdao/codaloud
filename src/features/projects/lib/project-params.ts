import z from "zod";

import { paginationSchema } from "@/lib/schemas";

export const projectSortFields = ["name", "createdAt", "updatedAt"] as const;
export type ProjectSortField = (typeof projectSortFields)[number];

export const projectSortOrders = ["asc", "desc"] as const;
export type ProjectSortOrder = (typeof projectSortOrders)[number];

export const projectParamsSchema = z
  .strictObject({
    search: paginationSchema.shape.search.default(""),
    sortBy: z.enum(projectSortFields).default("updatedAt"),
    sortOrder: z.enum(projectSortOrders).default("desc"),
    page: paginationSchema.shape.page,
    pageSize: paginationSchema.shape.pageSize,
  })
  .refine(({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize), {
    message: "Requested page is too large.",
    path: ["page"],
  });

export type ProjectParamsSchema = z.infer<typeof projectParamsSchema>;
