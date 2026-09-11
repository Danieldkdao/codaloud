import type {
  GitHubRepositoryPage,
  GitHubRepositoryPagination,
  LoadGitHubRepositoryBatch,
} from "../types";
import { paginateGitHubSearch } from "./search-pagination";

export const paginateGitHubRepositories = async (
  loadBatch: LoadGitHubRepositoryBatch,
  pagination: GitHubRepositoryPagination = {},
  signal?: AbortSignal,
): Promise<GitHubRepositoryPage> => {
  const { items: repositories, nextCursor } = await paginateGitHubSearch({
    loadBatch: async (page, pageSize) => {
      const { repositories, hasNextPage } = await loadBatch(page, pageSize);
      return { items: repositories, hasNextPage };
    },
    matchesSearch: (repository, search) =>
      repository.name.toLowerCase().includes(search) ||
      repository.fullName.toLowerCase().includes(search) ||
      (repository.description?.toLowerCase().includes(search) ?? false),
    pagination,
    signal,
  });
  return { repositories, nextCursor };
};
