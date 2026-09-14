import type { CheckoutProjectBranchSchema } from "../actions/branch-schemas";
import { getUserReadyProject } from "./project-workspace";
import { SandboxFilesError } from "@/services/daytona/api";
import { checkoutSandboxBranch } from "@/services/daytona/checkout";
import {
  getGitHubCredentials,
  getGitHubErrorResponse,
} from "@/services/github/server/access";
import { verifyGitHubRepositoryAccess } from "@/services/github/server/repositories";

export const checkoutUserProjectBranch = async (
  userId: string,
  headers: Headers,
  projectId: string,
  input: CheckoutProjectBranchSchema,
  signal?: AbortSignal,
) => {
  const existingProject = await getUserReadyProject(userId, projectId);
  const deadline = AbortSignal.timeout(30_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;

  if (existingProject.githubRepositoryId) {
    try {
      const { accessToken } = await getGitHubCredentials(headers);
      await verifyGitHubRepositoryAccess(
        accessToken,
        existingProject.githubRepositoryId,
        requestSignal,
      );
    } catch (error) {
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
  );
};
