import type {
  GitHubRepositoryPage,
  GitHubRepositoryBranchPage,
  ReadGitHubRepositoriesOptions,
} from "../types";
import { getGitHubAccessToken } from "../credentials";
import {
  listGitHubRepositoryPage,
  listGitHubRepositoryBranches,
} from "../server/repositories";
import {
  gitHubRepositoryPageSchema,
  gitHubRepositoryRequestSchema,
  gitHubRepositoryBranchesRequestSchema,
  gitHubRepositoryBranchPageSchema,
} from "../schemas";

export const readGitHubRepositories = async ({
  signal,
  ...pagination
}: ReadGitHubRepositoriesOptions = {}): Promise<GitHubRepositoryPage | null> => {
  try {
    if (signal?.aborted) return null;
    const input = gitHubRepositoryRequestSchema.parse(pagination);
    const token = await getGitHubAccessToken();
    if (signal?.aborted) return null;
    const page = gitHubRepositoryPageSchema.parse(
      await listGitHubRepositoryPage(token, signal, input),
    );
    if (input.cursor && page.nextCursor === input.cursor) return null;
    return page;
  } catch {
    return null;
  }
};

export const readGitHubRepositoryBranches = async (
  repositoryId: string,
  { signal, ...pagination }: ReadGitHubRepositoriesOptions = {},
): Promise<GitHubRepositoryBranchPage | null> => {
  try {
    if (signal?.aborted) return null;
    const input = gitHubRepositoryBranchesRequestSchema.parse({
      repositoryId,
      ...pagination,
    });
    const token = await getGitHubAccessToken();
    if (signal?.aborted) return null;
    const page = gitHubRepositoryBranchPageSchema.parse(
      await listGitHubRepositoryBranches(
        token,
        input.repositoryId,
        signal,
        input,
      ),
    );
    if (input.cursor && page.nextCursor === input.cursor) return null;
    return page;
  } catch {
    return null;
  }
};
