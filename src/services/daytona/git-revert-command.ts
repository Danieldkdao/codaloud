import { createGitOperationCommand } from "./git-command";

export const sandboxGitRevertCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  checkExpected();
  ensureClean();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  const parents = git(["rev-list", "--parents", "-n", "1", input.expectedHeadSha]).trim().split(" ").length - 1;
  if ((parents > 1 && !input.mainline) || (input.mainline && (parents < 2 || input.mainline > parents))) fail("GIT_MERGE_MAINLINE_REQUIRED");
  mutationStarted = true;
  try { git(["revert", "--no-edit", "--no-gpg-sign", ...(input.mainline ? ["--mainline", String(input.mainline)] : []), input.expectedHeadSha]); }
  catch (error) { if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS"); throw error; }
  const hash = head();
  if (!hash || hash === input.expectedHeadSha || branch() !== input.expectedBranch || git(["rev-parse", "HEAD^"]).trim() !== input.expectedHeadSha) fail("GIT_OUTCOME_UNKNOWN");
  return { hash, parentHash: input.expectedHeadSha, currentBranch: branch() };
`);
