import type {
  GitHubRepository,
  GitHubRepositoryPagination,
} from "@/services/github/types";
import { Octokit } from "octokit";
import { GitHubAccessError } from "./access";
import { paginateGitHubRepositories } from "./repository-pagination";

const repositoryOptions = {
  visibility: "all",
  affiliation: "owner,collaborator,organization_member",
  sort: "updated",
  direction: "desc",
} as const;

type GitHubApiRepository = Awaited<
  ReturnType<Octokit["rest"]["repos"]["listForAuthenticatedUser"]>
>["data"][number];

// Return only picker data, never GitHub's complete response or credentials.
const toGitHubRepository = (repository: GitHubApiRepository): GitHubRepository => ({
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
});

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

export const listGitHubRepositoryPage = async (
  accessToken: string,
  signal?: AbortSignal,
  pagination: GitHubRepositoryPagination = {},
) => {
  const octokit = createGitHubClient(accessToken, signal);
  return paginateGitHubRepositories(
    async (page, pageSize) => {
      const { data, headers } = await octokit.rest.repos.listForAuthenticatedUser({
        ...repositoryOptions,
        page,
        per_page: pageSize,
      });
      return {
        repositories: data.map(toGitHubRepository),
        hasNextPage: /;\s*rel="next"/.test(headers.link ?? ""),
      };
    },
    pagination,
    signal,
  );
};
