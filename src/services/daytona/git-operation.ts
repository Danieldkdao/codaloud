import { z } from "zod";
import { requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { getSandboxGitRepository } from "./branches";

const operationError = (code: string) => {
  switch (code) {
    case "INVALID_STASH_CURSOR": return new SandboxFilesError(400, code, "Invalid stash cursor or changed search. Start a new stash search.");
    case "GIT_BUSY": return new SandboxFilesError(409, code, "Another Git operation is running. Refresh before trying again.");
    case "WORKSPACE_CHANGED": return new SandboxFilesError(409, code, "The checked-out branch or commit changed. Refresh before trying again.");
    case "GIT_CONFLICTS": return new SandboxFilesError(409, code, "The operation encountered conflicts. Work may be partially applied. Resolve or abort the operation before retrying; any conflicting stash is retained.");
    case "GIT_OPERATION_IN_PROGRESS": return new SandboxFilesError(409, code, "Finish or abort the existing Git operation first.");
    case "GIT_DIRTY_WORKTREE": return new SandboxFilesError(409, code, "Commit or stash your work before this operation.");
    case "GIT_BRANCH_EXISTS": return new SandboxFilesError(409, code, "A branch with that name already exists.");
    case "GIT_PARENT_REQUIRED":
      return new SandboxFilesError(
        409,
        code,
        "The current commit has no parent. The initial commit cannot be undone with this operation.",
      );
    case "GIT_STASH_CHANGED": return new SandboxFilesError(409, code, "The stash selection changed. Reload stashes and working changes before retrying; the stash may already have been applied and retained.");
    case "GIT_STASH_NOT_FOUND": return new SandboxFilesError(404, code, "The selected stash was not found.");
    case "GIT_REMOTE_REJECTED": return new SandboxFilesError(409, code, "The remote rejected the push. Check branch protection, permissions, and the expected remote commit before retrying.");
    case "GIT_REMOTE_MISMATCH": return new SandboxFilesError(409, code, "The workspace origin does not match the connected GitHub repository.");
    case "GIT_BRANCH_REQUIRED":
    case "GIT_UPSTREAM_REQUIRED":
    case "GIT_REMOTE_REQUIRED":
    case "GIT_REPOSITORY_UNAVAILABLE": return new SandboxFilesError(409, code, "This operation requires an initialized workspace and the requested branch or upstream.");
    case "GIT_UNSUPPORTED_CONFIG":
    case "GIT_HISTORY_INCOMPLETE":
    case "GIT_MERGE_MAINLINE_REQUIRED": return new SandboxFilesError(422, code, "The repository configuration, history, or merge parent is unsupported for this operation.");
    case "GIT_RESULT_TOO_LARGE": return new SandboxFilesError(422, code, "The Git result is too large. Request a smaller page or another stash.");
    case "GIT_REMOTE_FAILED": return new SandboxFilesError(502, code, "Unable to fetch from GitHub. Check access and refresh remote state before retrying.");
    case "GIT_REQUEST_FAILED": return new SandboxFilesError(502, code, "Unable to complete the Git request. Refresh the workspace before retrying.");
    default: return new SandboxFilesError(502, "GIT_OUTCOME_UNKNOWN", "Unable to confirm the operation. It may have completed or partially changed the workspace or remote. Refresh before retrying.");
  }
};

export const executeGitOperation = async <T>(options: {
  sandboxId: string; projectId: string; script: string; input: unknown;
  output: z.ZodType<T>; signal: AbortSignal; mutation: boolean;
}): Promise<T> => {
  const repository = await getSandboxGitRepository(options.sandboxId, options.projectId);
  options.signal.throwIfAborted();
  let response;
  try {
    response = z.object({ exitCode: z.number().int(), result: z.string().max(4 * 1024 * 1024) }).parse(
      await requestDaytona(`${repository.toolboxUrl}/process/execute`, {
        method: "POST", signal: AbortSignal.any([options.signal, AbortSignal.timeout(95_000)]),
        body: JSON.stringify(createSandboxCommand(options.script, {
          ...options.input as object, repositoryPath: repository.repositoryPath,
          projectId: options.projectId, sandboxId: options.sandboxId,
        }, 90)),
      }),
    );
    if (response.exitCode === 0) return options.output.parse(JSON.parse(response.result));
  } catch {
    throw operationError(options.mutation ? "GIT_OUTCOME_UNKNOWN" : "GIT_REQUEST_FAILED");
  }
  let code;
  try { code = z.object({ code: z.string() }).parse(JSON.parse(response.result)).code; }
  catch { throw operationError(options.mutation ? "GIT_OUTCOME_UNKNOWN" : "GIT_REQUEST_FAILED"); }
  throw operationError(code);
};
