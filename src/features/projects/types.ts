export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  permissions: {
    pull: boolean;
    push: boolean;
    admin: boolean;
  };
};

export type GitHubRepositoryPagination = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ReadGitHubRepositoriesOptions = GitHubRepositoryPagination & {
  signal?: AbortSignal;
};
