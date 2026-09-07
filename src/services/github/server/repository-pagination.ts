import { PAGE_SIZE } from "@/lib/constants";
import { GITHUB_SEARCH_BATCH_SIZE, GITHUB_SEARCH_MAX_BATCHES } from "../constants";
import type {
  GitHubRepositoryPage,
  GitHubRepositoryPagination,
  LoadGitHubRepositoryBatch,
} from "../types";
import { readRepositoryCursor, writeRepositoryCursor } from "./repository-cursor";

export const paginateGitHubRepositories = async (
  loadBatch: LoadGitHubRepositoryBatch,
  { search = "", pageSize = PAGE_SIZE, cursor }: GitHubRepositoryPagination = {},
  signal?: AbortSignal,
): Promise<GitHubRepositoryPage> => {
  const normalizedSearch = search.trim().toLowerCase();
  const position = readRepositoryCursor(cursor, normalizedSearch, pageSize);
  const batchSize = normalizedSearch ? GITHUB_SEARCH_BATCH_SIZE : pageSize;
  const maxBatches = normalizedSearch ? GITHUB_SEARCH_MAX_BATCHES : 1;
  const repositories: GitHubRepositoryPage["repositories"] = [];

  for (let batch = 0; batch < maxBatches; batch++) {
    signal?.throwIfAborted();
    const result = await loadBatch(position.page, batchSize);
    signal?.throwIfAborted();

    for (let index = position.offset; index < result.repositories.length; index++) {
      const repository = result.repositories[index];
      if (
        normalizedSearch &&
        !repository.name.toLowerCase().includes(normalizedSearch) &&
        !repository.description?.toLowerCase().includes(normalizedSearch)
      ) {
        continue;
      }
      repositories.push(repository);
      if (repositories.length === pageSize) {
        // Retain the exact position when a result page ends inside a GitHub page.
        // Only that unfinished page can be fetched again on the next request.
        const hasRemainder = index + 1 < result.repositories.length;
        return {
          repositories,
          nextCursor: hasRemainder || result.hasNextPage
            ? writeRepositoryCursor({
                ...position,
                page: hasRemainder ? position.page : position.page + 1,
                offset: hasRemainder ? index + 1 : 0,
              })
            : null,
        };
      }
    }

    if (!result.hasNextPage) return { repositories, nextCursor: null };
    position.page++;
    position.offset = 0;
  }

  return { repositories, nextCursor: writeRepositoryCursor(position) };
};
