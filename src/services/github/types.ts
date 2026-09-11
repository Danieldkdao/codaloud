import type {
  GitHubRepositorySchema,
  GitHubRepositoryPageSchema,
  GitHubRepositoryRequestSchema,
  GitHubRepositoryBranchSchema,
  GitHubRepositoryBranchPageSchema,
} from "./schemas";

export type GitHubRepository = GitHubRepositorySchema;
export type GitHubRepositoryPage = GitHubRepositoryPageSchema;
export type GitHubRepositoryPagination = Partial<GitHubRepositoryRequestSchema>;

export type GitHubRepositoryBranch = GitHubRepositoryBranchSchema;
export type GitHubRepositoryBranchPage = GitHubRepositoryBranchPageSchema;

export type GitHubSearchPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type GitHubSearchPaginationOptions<T> = {
  loadBatch: (page: number, pageSize: number) => Promise<{
    items: T[];
    hasNextPage: boolean;
  }>;
  matchesSearch: (item: T, normalizedSearch: string) => boolean;
  pagination?: GitHubRepositoryPagination;
  signal?: AbortSignal;
  scope?: string;
};

export type ReadGitHubRepositoriesOptions = GitHubRepositoryPagination & {
  signal?: AbortSignal;
};

export type GitHubRepositoryBatch = {
  repositories: GitHubRepository[];
  hasNextPage: boolean;
};

export type LoadGitHubRepositoryBatch = (
  page: number,
  pageSize: number,
) => Promise<GitHubRepositoryBatch>;
