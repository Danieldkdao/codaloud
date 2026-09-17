import { SandboxFilesError } from "@/services/daytona/api";
import { getGitHubCredentials, getGitHubErrorResponse } from "@/services/github/server/access";
import { verifyGitHubRepositoryAccess } from "@/services/github/server/repositories";

export const getProjectGitRemote = async (headers: Headers, repositoryId: string | null, write: boolean, signal: AbortSignal) => {
  if (!repositoryId) throw new SandboxFilesError(409, "GITHUB_REPOSITORY_REQUIRED", "Connect a GitHub repository before synchronizing.");
  try {
    const { accessToken } = await getGitHubCredentials(headers);
    const repository = await verifyGitHubRepositoryAccess(accessToken, repositoryId, signal);
    if (write && (!repository.permissions.push || repository.archived)) {
      throw new SandboxFilesError(403, "GITHUB_PUSH_DENIED", "The repository is archived or your GitHub account cannot push to it.");
    }
    return { repositoryId, cloneUrl: `https://github.com/${repository.fullName}.git`, accessToken };
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    const { status, body } = getGitHubErrorResponse(error);
    throw new SandboxFilesError(status, (body.error && body.code) || "GITHUB_ACCESS_FAILED", body.message);
  }
};
