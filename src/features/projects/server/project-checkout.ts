import type { CheckoutProjectBranchSchema } from "../actions/branch-schemas";
import { getUserReadyProject } from "./project-workspace";
import { SandboxFilesError } from "@/services/daytona/api";
import { checkoutSandboxBranch } from "@/services/daytona/checkout";
import type { RemoteBranchFetchInput } from "@/services/daytona/fetch-branch";
import { RequestError } from "octokit";
import {
  getGitHubCredentials,
  getGitHubErrorResponse,
} from "@/services/github/server/access";
import { verifyGitHubRepositoryAccess, verifyGitHubRepositoryBranch } from "@/services/github/server/repositories";

export const checkoutUserProjectBranch = async (
  userId: string,
  headers: Headers,
  projectId: string,
  input: CheckoutProjectBranchSchema,
  signal?: AbortSignal,
) => {
  const existingProject = await getUserReadyProject(userId, projectId);
  const deadline = AbortSignal.timeout(input.source === "remote" ? 75_000 : 30_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;

  let remote: RemoteBranchFetchInput | undefined;
  if (input.source === "remote" && !existingProject.githubRepositoryId) {
    throw new SandboxFilesError(409, "GITHUB_REPOSITORY_REQUIRED", "Connect a GitHub repository to this project before checking out remote branches.");
  }
  if (existingProject.githubRepositoryId) {
    try {
      const { accessToken } = await getGitHubCredentials(headers);
      const repository = await verifyGitHubRepositoryAccess(
        accessToken,
        existingProject.githubRepositoryId,
        requestSignal,
      );
      if (input.source === "remote") {
        try {
          await verifyGitHubRepositoryBranch(accessToken, repository, input.branchName, requestSignal);
        } catch (error) {
          if (error instanceof RequestError && error.status === 404) {
            throw new SandboxFilesError(404, "REMOTE_BRANCH_NOT_FOUND", "The remote branch no longer exists or is unavailable. Refresh the branch list and check repository access.");
          }
          throw error;
        }
        remote = { repositoryId: existingProject.githubRepositoryId, cloneUrl: `https://github.com/${repository.fullName}.git`, accessToken };
      }
    } catch (error) {
      if (error instanceof SandboxFilesError) throw error;
      const { status, body } = getGitHubErrorResponse(error);
      throw new SandboxFilesError(
        status,
        (body.error && body.code) || "GITHUB_REPOSITORY_ACCESS_FAILED",
        body.message,
      );
    }
  }

  return checkoutSandboxBranch(
    existingProject.sandboxId,
    existingProject.id,
    input.branchName,
    requestSignal,
    remote,
  );
};
