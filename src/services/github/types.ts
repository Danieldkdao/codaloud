import type {
  GitHubRepositorySchema,
  GitHubRepositoryPageSchema,
  GitHubRepositoryRequestSchema,
} from "./schemas";

export type GitHubRepository = GitHubRepositorySchema;
export type GitHubRepositoryPage = GitHubRepositoryPageSchema;
export type GitHubRepositoryPagination = Partial<GitHubRepositoryRequestSchema>;

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
