import { useCallback } from "react";
import { View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatDraftSortField,
  formatDraftSortOrder,
} from "@/features/drafts/lib/formatters";
import {
  draftSortFields,
  sortOrders,
  type DraftParamsSchema,
} from "@/features/drafts/lib/draft-params";

export type DraftFiltersProps = {
  filters: DraftParamsSchema;
  /** Receives partial updates, matching useDraftsFilters.updateFilters. */
  setFilters: (updates: Partial<DraftParamsSchema>) => void;
};

export const DraftFilters = ({ filters, setFilters }: DraftFiltersProps) => {
  const updateSearch = useCallback(
    (search: string) => {
      // Send only changed fields so a debounced search preserves newer sort choices.
      setFilters({ search });
    },
    [setFilters],
  );

  return (
    <View className="w-full flex-row items-center gap-2">
      <SearchInput
        initialSearch={filters.search}
        onValueChange={updateSearch}
        placeholder="Search drafts…"
        parentClassName="min-w-0 flex-1"
      />
      <NativeSelect
        label="Draft filters"
        icon={
          <Icon
            family="Feather"
            name="sliders"
            size={20}
            className="text-foreground"
            accessible={false}
            aria-hidden
          />
        }
        sections={[
          {
            label: "Sort by",
            value: filters.sortBy,
            options: draftSortFields.map((value) => ({
              value,
              label: formatDraftSortField(value),
              onSelect: () => setFilters({ sortBy: value }),
            })),
          },
          {
            label: "Order",
            value: filters.sortOrder,
            options: sortOrders.map((value) => ({
              value,
              label: formatDraftSortOrder(value),
              onSelect: () => setFilters({ sortOrder: value }),
            })),
          },
        ]}
      />
    </View>
  );
};
