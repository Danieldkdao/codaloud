import { useCallback, useState } from "react";

import {
  draftParamsSchema,
  type DraftParamsSchema,
} from "@/features/drafts/lib/draft-params";

export const useDraftsFilters = () => {
  const [filters, setFilters] = useState(() => draftParamsSchema.parse({}));

  const updateFilters = useCallback((updates: Partial<DraftParamsSchema>) => {
    setFilters((currentFilters) => {
      const result = draftParamsSchema.safeParse({
        ...currentFilters,
        ...updates,
      });
      return result.success ? result.data : currentFilters;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(draftParamsSchema.parse({}));
  }, []);

  return { filters, updateFilters, resetFilters };
};
