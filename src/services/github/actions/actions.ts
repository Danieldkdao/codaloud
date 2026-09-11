import type {
  GitHubRepositoryPage,
  GitHubRepositoryBranchPage,
  ReadGitHubRepositoriesOptions,
} from "@/services/github/types";
import { PAGE_SIZE } from "@/lib/constants";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import type { ApiResponse } from "@/lib/types";
import { createRequestHeaders, createSearchParams, fetchBase } from "@/lib/utils";
import {
  gitHubRepositoryPageSchema,
  gitHubRepositoryBranchesRequestSchema,
  readGitHubRepositoryBranchesResponseSchema,
} from "@/services/github/schemas";

export const readGitHubRepositories = async ({
  signal,
  search,
  cursor,
  pageSize = PAGE_SIZE,
}: ReadGitHubRepositoriesOptions = {}): Promise<GitHubRepositoryPage> => {
  const headers = await createRequestHeaders();

  const query = createSearchParams({
    pageSize,
    cursor,
    search: search || undefined,
  });
  const response = await fetchBase(`/api/github/repositories?${query}`, {
    method: "GET",
    headers,
    credentials: "omit",
    signal,
  });

  let result: ApiResponse<GitHubRepositoryPage>;
  try {
    result = await response.json();
  } catch {
    signal?.throwIfAborted();
    throw Object.assign(new Error("Unable to read the repository response."), {
      status: response.status,
    });
  }

  if (!response.ok || result?.error) {
    throw Object.assign(
      new Error(result?.message || "Unable to load GitHub repositories."),
      { status: response.status, code: result?.error ? result.code : undefined },
    );
  }
  const page = gitHubRepositoryPageSchema.safeParse(result?.data);
  if (!page.success || (cursor != null && page.data.nextCursor === cursor)) {
    throw new Error("The server returned an invalid repository response.");
  }

  return page.data;
};

export const readGitHubRepositoryBranches = async (
  repositoryId: string,
  { signal, search, cursor, pageSize }: ReadGitHubRepositoriesOptions = {},
): Promise<GitHubRepositoryBranchPage | null> => {
  try {
    const input = gitHubRepositoryBranchesRequestSchema.safeParse({
      repositoryId, search, cursor, pageSize,
    });
    if (!input.success) return null;

    const { userId, error } = await getCurrentUserClient();
    if (!userId || error) return null;

    const headers = await createRequestHeaders();
    const query = createSearchParams({
      pageSize: input.data.pageSize,
      cursor: input.data.cursor,
      search: input.data.search || undefined,
    });
    // The route rechecks the session, repository existence, and read permission.
    const response = await fetchBase(`/api/github/repository/${input.data.repositoryId}/branches?${query}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const result = readGitHubRepositoryBranchesResponseSchema.safeParse(payload);
    if (!result.success) return null;
    if (cursor != null && result.data.data.nextCursor === cursor) return null;

    return result.data.data;
  } catch {
    return null;
  }
};
