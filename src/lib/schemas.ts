import { z } from "zod";
import { DEFAULT_PAGE, PAGE_SIZE } from "./constants";

export const paginationSchema = z.object({
  search: z.string().trim().max(200, { error: "Search must be at most 200 characters." }).optional(),
  page: z.coerce
    .number({ error: "Page must be a number." })
    .int({ error: "Page must be a safe integer." })
    .min(1, { error: "Page must be at least 1." })
    .default(DEFAULT_PAGE),
  pageSize: z.coerce
    .number({ error: "Page size must be a number." })
    .int({ error: "Page size must be a safe integer." })
    .min(1, { error: "Page size must be at least 1." })
    .max(100, { error: "Page size must be at most 100." })
    .default(PAGE_SIZE),
});

export type PaginationSchema = z.infer<typeof paginationSchema>;
