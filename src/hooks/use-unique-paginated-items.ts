import { useMemo } from "react";

// Keep selectors stable to reuse the memoized array when only query status changes.
export const useUniquePaginatedItems = <TPage, T>(
  pages: readonly TPage[] | undefined,
  getItems: (page: TPage) => readonly T[],
  getKey: (item: T) => PropertyKey,
): T[] => useMemo(() => {
  const unique = new Map<PropertyKey, T>();
  for (const page of pages ?? []) {
    for (const item of getItems(page)) {
      const key = getKey(item);
      // Preserve the server's order and keep the first occurrence across pages.
      if (!unique.has(key)) unique.set(key, item);
    }
  }
  return Array.from(unique.values());
}, [pages, getItems, getKey]);
