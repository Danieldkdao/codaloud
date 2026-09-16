import { createGitOperationCommand } from "./git-command";

export const sandboxGitUndoCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  const currentState = captureCurrentState();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  // Resolve from the captured commit, not a later read of HEAD. For merges,
  // undo returns to the first parent, just like resetting to HEAD~1.
  const parentSha = optional(["rev-parse", "--verify", "--quiet", currentState.headSha + "^1^{commit}"]);
  if (!parentSha) fail("GIT_PARENT_REQUIRED");
  checkExpected();
  mutationStarted = true;
  // The strict API enum permits only soft/mixed/hard. Preserve their native
  // index/worktree semantics, including discarding dirty work in hard mode.
  git(["reset", "--" + input.mode, "--no-recurse-submodules", parentSha, "--"]);
  if (branch() !== currentState.branchName || head() !== parentSha) fail("GIT_OUTCOME_UNKNOWN");
  return { previousHeadSha: currentState.headSha, headSha: parentSha, currentBranch: currentState.branchName, mode: input.mode };
`);
