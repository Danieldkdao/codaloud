import { useInfiniteQuery } from "@tanstack/react-query";

import { readDraftsAction } from "@/features/drafts/actions/draft-actions";
import {
  draftParamsSchema,
  type DraftParamsSchema,
} from "@/features/drafts/lib/draft-params";

export const useDrafts = (filters: Partial<DraftParamsSchema> = {}) => {
  const params = draftParamsSchema.parse(filters);

  return useInfiniteQuery({
    queryKey: ["drafts", "infinite", "cursor", params],
    networkMode: "always",
    initialPageParam: (params.cursor ?? null) as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const existingDrafts = await readDraftsAction(
        { ...params, cursor: pageParam },
        signal,
      );

      // Read actions return null on failure; queries must reject to expose an error.
      if (existingDrafts === null)
        throw new Error("Unable to load drafts. Please try again.");

      return existingDrafts;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
};
