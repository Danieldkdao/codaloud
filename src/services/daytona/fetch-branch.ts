import { z } from "zod";
import { requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { sandboxFetchBranchCommand } from "./fetch-branch-command";

export type RemoteBranchFetchInput = {
  repositoryId: string;
  cloneUrl: string;
  accessToken: string;
};

const fetchFailure = (code: string): SandboxFilesError => {
  switch (code) {
    case "REMOTE_BRANCH_NOT_FOUND":
      return new SandboxFilesError(404, code, "The remote branch no longer exists. Refresh the branch list and select another branch.");
    case "REMOTE_FETCH_AUTH_FAILED":
      return new SandboxFilesError(403, code, "GitHub refused the branch fetch. Reconnect GitHub and check repository access, then try again.");
    case "WORKSPACE_REMOTE_MISMATCH":
      return new SandboxFilesError(409, code, "The workspace origin does not match this project's GitHub repository. Restore the correct origin before fetching branches.");
    default:
      return new SandboxFilesError(502, "REMOTE_FETCH_FAILED", "Unable to fetch the remote branch. Check the connection and workspace disk space, then refresh the branch list and try again.");
  }
};

export const fetchSandboxBranch = async (
  repository: { toolboxUrl: string; repositoryPath: string },
  branchName: string,
  remote: RemoteBranchFetchInput,
  signal?: AbortSignal,
) => {
  try {
    const response = z.object({ exitCode: z.number().int(), result: z.string().max(16_384) }).parse(
      await requestDaytona(`${repository.toolboxUrl}/process/execute`, {
        method: "POST", signal,
        body: JSON.stringify(createSandboxCommand(sandboxFetchBranchCommand, { ...remote, repositoryPath: repository.repositoryPath, branchName }, 50)),
      }),
    );
    const result: unknown = JSON.parse(response.result);
    if (response.exitCode !== 0) throw fetchFailure(z.object({ code: z.string() }).parse(result).code);
    if (z.object({ branchName: z.string() }).parse(result).branchName !== branchName) throw fetchFailure("REMOTE_FETCH_FAILED");
  } catch (error) {
    if (error instanceof SandboxFilesError && error.code !== "DAYTONA_REQUEST_FAILED") throw error;
    // Never propagate command output, tokens, or credential-bearing request bodies.
    throw fetchFailure("REMOTE_FETCH_FAILED");
  }
};
