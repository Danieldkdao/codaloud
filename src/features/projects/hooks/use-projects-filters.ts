import { useCallback, useState } from "react";

import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";

export const useProjectsFilters = () => {
  const [filters, setFilters] = useState(() => projectParamsSchema.parse({}));

  const updateFilters = useCallback((updates: Partial<ProjectParamsSchema>) => {
    setFilters((currentFilters) => {
      const result = projectParamsSchema.safeParse({
        ...currentFilters,
        ...updates,
      });
      return result.success ? result.data : currentFilters;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(projectParamsSchema.parse({}));
  }, []);

  return { filters, updateFilters, resetFilters };
};
