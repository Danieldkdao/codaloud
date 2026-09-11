import { getGitHubCredentialsForUser, GitHubAccessError } from "./access";
import { verifyGitHubRepositoryAccess, verifyGitHubRepositoryBranch } from "./repositories";

// Server-only input comes from the saved project and its setup operation.
// The returned token is for the clone call, never task payloads, results, or logs.
export const getGitHubImportSource = async (
  userId: string,
  accountId: string | null,
  repositoryId: string,
  branchName: string | null,
  signal?: AbortSignal,
) => {
  if (!branchName?.trim()) {
    throw new GitHubAccessError("The import has no saved branch. Create a project with a selected GitHub branch.");
  }
  const { accessToken } = await getGitHubCredentialsForUser(userId, accountId);
  const repository = await verifyGitHubRepositoryAccess(accessToken, repositoryId, signal);
  // Credentials must only be sent to GitHub's canonical HTTPS clone endpoint.
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.fullName) ||
    repository.cloneUrl !== `https://github.com/${repository.fullName}.git`) {
    throw new GitHubAccessError("GitHub returned an invalid repository clone URL.");
  }
  await verifyGitHubRepositoryBranch(accessToken, repository, branchName, signal);
  return { repository, accessToken, branchName };
};
