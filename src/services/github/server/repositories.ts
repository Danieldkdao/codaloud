import type {
  GitHubRepository,
  GitHubRepositoryPagination,
} from "@/features/projects/types";
import { Octokit } from "octokit";
import { DEFAULT_PAGE, PAGE_SIZE } from "@/lib/constants";
import { GitHubAccessError } from "./access";

const createGitHubClient = (accessToken: string, signal?: AbortSignal) =>
  new Octokit({
    auth: accessToken,
    request: { signal, timeout: 15_000 },
    // Let the caller handle rate limits instead of keeping an API request waiting.
    throttle: { enabled: false },
    retry: { enabled: false },
  });

export const verifyGitHubRepositoryAccess = async (
  accessToken: string,
  repositoryId: string,
  signal?: AbortSignal,
) => {
  const octokit = createGitHubClient(accessToken, signal);
  // GitHub's ID lookup survives renames and avoids scanning every picker page.
  // This REST endpoint is supported by GitHub but absent from Octokit's generated types.
  const { data: repository } = await octokit.request("GET /repositories/{repository_id}", {
    repository_id: repositoryId,
  });
  if (String(repository?.id) !== repositoryId || repository?.permissions?.pull !== true) {
    throw new GitHubAccessError("You do not have access to import this GitHub repository.");
  }
};

export const listGitHubRepositories = async (
  accessToken: string,
  signal?: AbortSignal,
  {
    pageSize = PAGE_SIZE,
    page = DEFAULT_PAGE,
    search = "",
  }: GitHubRepositoryPagination = {},
): Promise<GitHubRepository[]> => {
  const octokit = createGitHubClient(accessToken, signal);

  const options = {
    visibility: "all",
    affiliation: "owner,collaborator,organization_member",
    sort: "updated",
    direction: "desc",
  } as const;
  const normalizedSearch = search.trim().toLowerCase();
  let repositories: Awaited<ReturnType<typeof octokit.rest.repos.listForAuthenticatedUser>>["data"];

  if (!normalizedSearch) {
    ({ data: repositories } = await octokit.rest.repos.listForAuthenticatedUser({
      ...options,
      per_page: pageSize,
      page,
    }));
  } else {
    // GitHub's user-repositories endpoint has no search parameter. Filter before
    // slicing so sparse matches across GitHub pages still fill a result page.
    repositories = [];
    let matchedCount = 0;
    const offset = (page - 1) * pageSize;
    for await (const { data } of octokit.paginate.iterator(
      octokit.rest.repos.listForAuthenticatedUser,
      { ...options, per_page: 100, page: DEFAULT_PAGE },
    )) {
      signal?.throwIfAborted();
      for (const repository of data) {
        if (
          !repository.name.toLowerCase().includes(normalizedSearch) &&
          !repository.description?.toLowerCase().includes(normalizedSearch)
        ) continue;
        if (matchedCount++ >= offset) repositories.push(repository);
        if (repositories.length === pageSize) break;
      }
      if (repositories.length === pageSize) break;
    }
  }

  // Return only picker data, never GitHub's complete response or credentials.
  return repositories.map((repository) => ({
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    private: repository.private,
    archived: repository.archived,
    defaultBranch: repository.default_branch,
    cloneUrl: repository.clone_url,
    htmlUrl: repository.html_url,
    permissions: {
      pull: repository.permissions?.pull ?? false,
      push: repository.permissions?.push ?? false,
      admin: repository.permissions?.admin ?? false,
    },
  }));
};
