import { createGitOperationCommand } from "./git-command";

// Preserve the established checkout error translator while executing under the
// same lock and Git configuration restrictions as the new mutation routes.
export const sandboxGitCheckoutCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  if (branch() !== input.previousBranch) fail("WORKSPACE_CHANGED");
  mutationStarted = true;
  try { git(["switch", "--no-guess", input.branch]); }
  catch (error) {
    if (error.status === null || !error.stderr) throw error;
    return { error: String(error.stderr).slice(0, 16384) };
  }
  return { checkedOut: true };
`);
