import { PAGE_SIZE } from "@/lib/constants";
import {
  GITHUB_SEARCH_BATCH_SIZE,
  GITHUB_SEARCH_MAX_BATCHES,
} from "../constants";
import type { GitHubSearchPage, GitHubSearchPaginationOptions } from "../types";
import {
  readRepositoryCursor,
  writeRepositoryCursor,
} from "./repository-cursor";

export const paginateGitHubSearch = async <T>({
  loadBatch,
  matchesSearch,
  pagination: { search = "", pageSize = PAGE_SIZE, cursor } = {},
  signal,
  scope,
}: GitHubSearchPaginationOptions<T>): Promise<GitHubSearchPage<T>> => {
  const normalizedSearch = search.trim().toLowerCase();
  const position = readRepositoryCursor(
    cursor,
    normalizedSearch,
    pageSize,
    scope,
  );
  const batchSize = normalizedSearch ? GITHUB_SEARCH_BATCH_SIZE : pageSize;
  const maxBatches = normalizedSearch ? GITHUB_SEARCH_MAX_BATCHES : 1;
  const items: T[] = [];

  for (let batch = 0; batch < maxBatches; batch++) {
    // React Native's AbortSignal supports aborted, but not throwIfAborted().
    if (signal?.aborted)
      throw new DOMException("The request was cancelled.", "AbortError");
    const result = await loadBatch(position.page, batchSize);
    if (signal?.aborted)
      throw new DOMException("The request was cancelled.", "AbortError");

    for (let index = position.offset; index < result.items.length; index++) {
      const item = result.items[index];
      if (normalizedSearch && !matchesSearch(item, normalizedSearch)) continue;
      items.push(item);
      if (items.length === pageSize) {
        // Retain the exact position when a result page ends inside a GitHub page.
        // Only that unfinished page can be fetched again on the next request.
        const hasRemainder = index + 1 < result.items.length;
        return {
          items,
          nextCursor:
            hasRemainder || result.hasNextPage
              ? writeRepositoryCursor({
                  ...position,
                  page: hasRemainder ? position.page : position.page + 1,
                  offset: hasRemainder ? index + 1 : 0,
                })
              : null,
        };
      }
    }

    if (!result.hasNextPage) return { items, nextCursor: null };
    position.page++;
    position.offset = 0;
  }

  return { items, nextCursor: writeRepositoryCursor(position) };
};
