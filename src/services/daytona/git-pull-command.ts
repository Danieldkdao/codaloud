import { createGitOperationCommand } from "./git-command";
import { sandboxGitRemoteRuntime } from "./git-remote-command";

export const sandboxGitPullCommand = createGitOperationCommand(sandboxGitRemoteRuntime + String.raw`
  ensureIdle();
  const currentState = captureCurrentState();
  ensureClean();
  const remoteBranchName = resolveRemoteBranch(currentState.branchName);
  prepareRemote();
  fetchRemote();
  ensureIdle();
  ensureClean();
  checkExpected();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  const remoteSha = optional(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + remoteBranchName + "^{commit}"]);
  if (!remoteSha) fail("GIT_UPSTREAM_REQUIRED");
  mutationStarted = true;
  try {
    if (input.rebase) {
      git(["-c", "rebase.rescheduleFailedExec=false", "rebase", "--no-autostash", "--no-autosquash", "--no-update-refs", "--no-gpg-sign", "--no-rebase-merges", "--no-fork-point", "--empty=keep", remoteSha]);
    } else {
      git(["merge", "--strategy=ort", "--ff", "--no-edit", "--no-gpg-sign", "--no-autostash", "--no-squash", "--commit", remoteSha]);
    }
  } catch (error) {
    if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS");
    throw error;
  }
  if (!head() || branch() !== currentState.branchName) fail("GIT_OUTCOME_UNKNOWN");
  // Integration is already complete; failure to read counts must not ask the
  // caller to repeat a successful merge or rebase.
  let refreshedCounts = null;
  try { refreshedCounts = counts(); } catch {}
  return { previousHeadSha: currentState.headSha, headSha: head(), currentBranch: branch(), rebased: input.rebase, counts: refreshedCounts };
`);
