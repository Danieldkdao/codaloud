import { serverEnv } from "@/data/env/server";
import { projectBranchCheckoutSchema } from "@/features/projects/actions/branch-schemas";
import { requestDaytona, SandboxFilesError } from "./api";
import { getSandboxGitRepository, readSandboxGitBranches } from "./branches";
import { fetchSandboxBranch, type RemoteBranchFetchInput } from "./fetch-branch";

const unknownCheckoutOutcome = () =>
  new SandboxFilesError(
    502,
    "CHECKOUT_OUTCOME_UNKNOWN",
    "The checkout could not be confirmed and the workspace may already have switched branches. Refresh the current branch and files before trying again.",
  );

const checkoutFailureResponse = async (
  response: Response,
): Promise<SandboxFilesError> => {
  const text = (await response.text()).slice(0, 16_384);
  let message = text;
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const value =
        "error" in body ? body.error : "message" in body ? body.message : null;
      message = typeof value === "string" ? value : "";
    }
  } catch {
    /* Some Toolbox versions return Git errors as plain text. */
  }
  // Return recognized reasons and affected paths, not raw provider messages,
  // which can include credentials, request headers, or server stack traces.
  const reason = message.toLowerCase();
  if (
    /would be overwritten|unstaged changes|uncommitted changes|worktree contains untracked files/.test(
      reason,
    )
  ) {
    const untracked = reason.includes("untracked");
    const filesBlock = message.match(
      /following (?:untracked working tree )?files[^\n]*:\r?\n((?:[\t ]+[^\r\n]+\r?\n?)+)/i,
    )?.[1];
    const files = filesBlock
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((path) =>
        path
          .replaceAll(serverEnv.DAYTONA_API_KEY, "[redacted]")
          .replace(/[\x00-\x1f\x7f]/g, "")
          .slice(0, 200),
      );
    const guidance = untracked
      ? "Untracked files would be overwritten by this branch switch. Move them out of the way or commit them, then try again."
      : "Your local changes prevent this branch switch. Commit or stash your changes, then try again.";
    return new SandboxFilesError(
      409,
      untracked ? "CHECKOUT_UNTRACKED_CONFLICT" : "CHECKOUT_CHANGES_CONFLICT",
      guidance + (files?.length ? ` Affected files: ${files.join(", ")}.` : ""),
    );
  }
  if (
    /resolve your current index|unmerged|unresolved conflict|merging|middle of a (?:merge|rebase|cherry-pick)/.test(
      reason,
    )
  ) {
    return new SandboxFilesError(
      409,
      "CHECKOUT_UNRESOLVED_CONFLICTS",
      "The repository has unresolved conflicts or an unfinished Git operation. Resolve the conflicts and finish or abort that operation before switching branches.",
    );
  }
  if (
    /index\.lock|another git process|could not lock|cannot lock ref|already checked out|already used by worktree/.test(
      reason,
    )
  ) {
    return new SandboxFilesError(
      409,
      "CHECKOUT_REPOSITORY_BUSY",
      "Git could not switch branches because the repository or branch is in use. Wait for the other Git operation to finish and check other worktrees before retrying.",
    );
  }
  if (
    /pathspec .*did not match|reference not found|branch .*not found|invalid reference|unknown revision/.test(
      reason,
    )
  ) {
    return new SandboxFilesError(
      404,
      "BRANCH_NOT_FOUND",
      "The selected branch is no longer available in this workspace. Refresh the branch list and select an existing local branch.",
    );
  }
  if (
    /not a git repository|repository does not exist|repository not found/.test(
      reason,
    )
  ) {
    return new SandboxFilesError(
      409,
      "WORKSPACE_REPOSITORY_MISSING",
      "The workspace Git repository could not be found. Reopen the project and check that its repository is available.",
    );
  }
  if (/no space left|disk quota exceeded/.test(reason)) {
    return new SandboxFilesError(
      409,
      "CHECKOUT_DISK_FULL",
      "The workspace has run out of disk space. Free up space in the workspace, then refresh its Git status before retrying.",
    );
  }
  if (
    /permission denied|operation not permitted|read-only file system/.test(
      reason,
    )
  ) {
    return new SandboxFilesError(
      409,
      "CHECKOUT_PERMISSION_DENIED",
      "Git cannot write to the repository. Check workspace file permissions and whether its filesystem is read-only, then refresh Git status before retrying.",
    );
  }
  return new SandboxFilesError(
    502,
    "CHECKOUT_FAILED",
    "Daytona could not complete the branch checkout. Refresh the current branch and Git status, then retry. If it still fails, inspect the workspace Git logs.",
  );
};

export const checkoutSandboxBranch = async (
  sandboxId: string,
  projectId: string,
  branchName: string,
  signal?: AbortSignal,
  remote?: RemoteBranchFetchInput,
) => {
  const repository = await getSandboxGitRepository(sandboxId, projectId);
  let existingBranches = await readSandboxGitBranches(
    repository,
    signal,
    checkoutFailureResponse,
  );
  if (remote && !existingBranches.branches.includes(branchName)) {
    await fetchSandboxBranch(repository, branchName, remote, signal);
    existingBranches = await readSandboxGitBranches(repository, signal, checkoutFailureResponse);
  }
  if (!existingBranches.branches.includes(branchName)) {
    throw new SandboxFilesError(
      404,
      "BRANCH_NOT_FOUND",
      "The selected branch does not exist locally in this workspace. Refresh the branches or fetch the remote branch before trying again.",
    );
  }
  const previousBranch = existingBranches.currentBranch;
  if (previousBranch === branchName)
    return { previousBranch, currentBranch: branchName };

  try {
    // The HTTP checkout operation has no force option. Git rejects switches
    // that would overwrite work; never retry by discarding, stashing, or resetting.
    await requestDaytona(
      `${repository.toolboxUrl}/git/checkout`,
      {
        method: "POST",
        signal,
        body: JSON.stringify({
          path: repository.repositoryPath,
          branch: branchName,
        }),
      },
      checkoutFailureResponse,
    );
  } catch (error) {
    if (
      error instanceof SandboxFilesError &&
      error.code !== "DAYTONA_REQUEST_FAILED"
    )
      throw error;
    // A lost response does not prove the server rolled back the checkout.
    throw unknownCheckoutOutcome();
  }

  let checkedOutBranches;
  try {
    checkedOutBranches = await readSandboxGitBranches(repository, signal);
  } catch {
    throw unknownCheckoutOutcome();
  }
  if (checkedOutBranches.currentBranch !== branchName) {
    throw new SandboxFilesError(
      409,
      "CHECKOUT_NOT_CONFIRMED",
      "The workspace did not report the requested branch after checkout. Another Git operation may have changed it. Refresh the current branch and files before retrying.",
    );
  }
  return projectBranchCheckoutSchema.parse({
    previousBranch,
    currentBranch: checkedOutBranches.currentBranch,
  });
};
