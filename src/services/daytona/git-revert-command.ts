import { createGitOperationCommand } from "./git-command";

export const sandboxGitRevertCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  const currentState = captureCurrentState();
  ensureClean();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  const parents = git(["rev-list", "--parents", "-n", "1", currentState.headSha]).trim().split(" ").length - 1;
  if ((parents > 1 && !input.mainline) || (input.mainline && (parents < 2 || input.mainline > parents))) fail("GIT_MERGE_MAINLINE_REQUIRED");
  checkExpected();
  mutationStarted = true;
  try { git(["revert", "--no-edit", "--no-gpg-sign", ...(input.mainline ? ["--mainline", String(input.mainline)] : []), currentState.headSha]); }
  catch (error) { if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS"); throw error; }
  const hash = head();
  if (!hash || hash === currentState.headSha || branch() !== currentState.branchName || git(["rev-parse", "HEAD^"]).trim() !== currentState.headSha) fail("GIT_OUTCOME_UNKNOWN");
  return { hash, parentHash: currentState.headSha, currentBranch: branch() };
`);
