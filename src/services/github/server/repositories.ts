import type {
  GitHubRepository,
  GitHubRepositoryBranchPage,
  GitHubRepositoryPagination,
} from "@/services/github/types";
import { Octokit as CoreOctokit } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import {
  gitHubRepositoryRequestSchema,
  gitHubRepositorySchema,
} from "@/services/github/schemas";
import { GitHubAccessError } from "../access-error";
import { GITHUB_API_VERSION } from "../constants";
import { paginateGitHubRepositories } from "./repository-pagination";
import { paginateGitHubSearch } from "./search-pagination";

// The all-in-one SDK includes Node-only webhook handlers; mobile only needs REST.
const Octokit = CoreOctokit.plugin(restEndpointMethods);
type Octokit = InstanceType<typeof Octokit>;

const repositoryOptions = {
  visibility: "all",
  affiliation: "owner,collaborator,organization_member",
  sort: "updated",
  direction: "desc",
} as const;

type GitHubApiRepository = Pick<
  Awaited<
    ReturnType<Octokit["rest"]["repos"]["listForAuthenticatedUser"]>
  >["data"][number],
  | "id"
  | "name"
  | "full_name"
  | "description"
  | "private"
  | "archived"
  | "default_branch"
  | "clone_url"
  | "html_url"
  | "permissions"
>;

// Return only picker data, never GitHub's complete response or credentials.
const toGitHubRepository = (
  repository: GitHubApiRepository,
): GitHubRepository => ({
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

export const createGitHubClient = (
  accessToken: string,
  signal?: AbortSignal,
) => {
  const octokit = new Octokit({
    auth: accessToken,
    request: { signal, timeout: 15_000 },
  });
  // Core's constructor does not forward custom headers. The hook covers both
  // generated REST methods and direct requests such as the repository ID lookup.
  octokit.hook.before("request", (options) => {
    options.headers["x-github-api-version"] = GITHUB_API_VERSION;
  });
  return octokit;
};

export const createGitHubRepository = async (
  accessToken: string,
  input: Pick<GitHubRepository, "name" | "private"> & { description?: string },
) => {
  const { data } = await createGitHubClient(
    accessToken,
  ).rest.repos.createForAuthenticatedUser({
    ...input,
    // Local history supplies the initial commit; a generated README would diverge.
    auto_init: false,
  });
  return gitHubRepositorySchema.parse(toGitHubRepository(data));
};

export const verifyGitHubRepositoryAccess = async (
  accessToken: string,
  repositoryId: string,
  signal?: AbortSignal,
) => {
  const octokit = createGitHubClient(accessToken, signal);
  // GitHub's ID lookup survives renames and avoids scanning every picker page.
  // This REST endpoint is supported by GitHub but absent from Octokit's generated types.
  const { data: repository } = await octokit.request(
    "GET /repositories/{repository_id}",
    {
      repository_id: repositoryId,
    },
  );
  if (
    String(repository?.id) !== repositoryId ||
    repository?.permissions?.pull !== true
  ) {
    throw new GitHubAccessError(
      "You do not have access to import this GitHub repository.",
    );
  }
  return gitHubRepositorySchema.parse(toGitHubRepository(repository));
};

export const verifyGitHubRepositoryBranch = async (
  accessToken: string,
  repository: GitHubRepository,
  branchName: string,
  signal?: AbortSignal,
) => {
  const [owner, repo] = repository.fullName.split("/");
  const { data } = await createGitHubClient(
    accessToken,
    signal,
  ).rest.repos.getBranch({
    owner,
    repo,
    branch: branchName,
  });
  // GitHub may redirect renamed branches; do not silently import a different selection.
  if (data.name !== branchName || !data.commit?.sha) {
    throw new GitHubAccessError(
      "The selected GitHub branch is no longer available.",
    );
  }
};

// Server callers supply the user's resolved token; recheck access on every call.
export const listGitHubRepositoryBranches = async (
  accessToken: string,
  repositoryId: string,
  signal?: AbortSignal,
  pagination: GitHubRepositoryPagination = {},
): Promise<GitHubRepositoryBranchPage> => {
  const validatedPagination = gitHubRepositoryRequestSchema.parse(pagination);
  const repository = await verifyGitHubRepositoryAccess(
    accessToken,
    repositoryId,
    signal,
  );
  const [owner, repo] = repository.fullName.split("/");
  const octokit = createGitHubClient(accessToken, signal);

  const { items: branches, nextCursor } = await paginateGitHubSearch({
    loadBatch: async (page, pageSize) => {
      const { data, headers } = await octokit.rest.repos.listBranches({
        owner,
        repo,
        page,
        per_page: pageSize,
      });
      return {
        items: data.map((branch) => ({
          name: branch.name,
          commitSha: branch.commit.sha,
          protected: branch.protected,
        })),
        hasNextPage: /;\s*rel="next"/.test(headers.link ?? ""),
      };
    },
    matchesSearch: (branch, search) =>
      branch.name.toLowerCase().includes(search),
    pagination: validatedPagination,
    signal,
    scope: `branches:${repositoryId}`,
  });
  return { branches, nextCursor };
};

export const listGitHubRepositoryPage = async (
  accessToken: string,
  signal?: AbortSignal,
  pagination: GitHubRepositoryPagination = {},
) => {
  const octokit = createGitHubClient(accessToken, signal);
  return paginateGitHubRepositories(
    async (page, pageSize) => {
      const { data, headers } =
        await octokit.rest.repos.listForAuthenticatedUser({
          ...repositoryOptions,
          page,
          per_page: pageSize,
        });
      // Saved scopes can outlive a token replacement or a revoked grant. GitHub
      // returns public-only results with HTTP 200 when an OAuth token lacks repo.
      const grantedScopes = headers["x-oauth-scopes"];
      if (
        grantedScopes !== undefined &&
        !grantedScopes.split(",").some((scope) => scope.trim() === "repo")
      ) {
        throw new GitHubAccessError(
          "Reconnect GitHub to grant access to public and private repositories.",
          "GITHUB_RECONNECT_REQUIRED",
        );
      }
      return {
        repositories: data.map(toGitHubRepository),
        hasNextPage: /;\s*rel="next"/.test(headers.link ?? ""),
      };
    },
    pagination,
    signal,
  );
};
