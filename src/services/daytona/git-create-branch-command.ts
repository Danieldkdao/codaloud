import { createGitOperationCommand } from "./git-command";

export const sandboxGitCreateBranchCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  const currentState = captureCurrentState();
  git(["check-ref-format", "--branch", input.branchName]);
  if (optional(["rev-parse", "--verify", "--quiet", "refs/heads/" + input.branchName])) fail("GIT_BRANCH_EXISTS");
  const previousBranch = currentState.branchName;
  checkExpected();
  mutationStarted = true;
  git(["switch", "--no-track", "-c", input.branchName]);
  if (branch() !== input.branchName || head() !== currentState.headSha) fail("WORKSPACE_CHANGED");
  return { previousBranch, currentBranch: branch(), headSha: head() };
`);
