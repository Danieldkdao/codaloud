import { useCallback } from "react";
import { View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatProjectSortField,
  formatProjectSortOrder,
} from "@/features/projects/lib/formatters";
import {
  projectSortFields,
  projectSortOrders,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";

export type ProjectFiltersProps = {
  filters: ProjectParamsSchema;
  /** Receives partial updates, matching useProjectsFilters.updateFilters. */
  setFilters: (updates: Partial<ProjectParamsSchema>) => void;
};

export const ProjectFilters = ({ filters, setFilters }: ProjectFiltersProps) => {
  const updateSearch = useCallback((search: string) => {
    // Send only changed fields so a debounced search preserves newer sort choices.
    setFilters({ search });
  }, [setFilters]);

  return (
    <View className="w-full flex-row items-center gap-2">
      <SearchInput
        initialSearch={filters.search}
        onValueChange={updateSearch}
        placeholder="Search projects…"
        parentClassName="min-w-0 flex-1"
      />
      <NativeSelect
        label="Project filters"
        icon={<Icon family="Feather" name="sliders" size={20} className="text-foreground" accessible={false} aria-hidden />}
        sections={[
          {
            label: "Sort by",
            value: filters.sortBy,
            options: projectSortFields.map((value) => ({
              value,
              label: formatProjectSortField(value),
              onSelect: () => setFilters({ sortBy: value }),
            })),
          },
          {
            label: "Order",
            value: filters.sortOrder,
            options: projectSortOrders.map((value) => ({
              value,
              label: formatProjectSortOrder(value),
              onSelect: () => setFilters({ sortOrder: value }),
            })),
          },
        ]}
      />
    </View>
  );
};
