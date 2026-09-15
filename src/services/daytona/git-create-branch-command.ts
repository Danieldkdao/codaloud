import { createGitOperationCommand } from "./git-command";

export const sandboxGitCreateBranchCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  checkExpected();
  git(["check-ref-format", "--branch", input.branchName]);
  if (optional(["rev-parse", "--verify", "--quiet", "refs/heads/" + input.branchName])) fail("GIT_BRANCH_EXISTS");
  const previousBranch = branch();
  mutationStarted = true;
  git(["switch", "--no-track", "-c", input.branchName]);
  if (branch() !== input.branchName || head() !== input.expectedHeadSha) fail("WORKSPACE_CHANGED");
  return { previousBranch, currentBranch: branch(), headSha: head() };
`);
