import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashPopCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  captureCurrentState();
  ensureClean();
  const selection = () => git(["stash", "list", "--skip=" + input.stashIndex, "--max-count=1", "--format=%H"]).trim();
  if (!selection()) fail("GIT_STASH_NOT_FOUND");
  if (selection() !== input.stashSha) fail("GIT_STASH_CHANGED");
  checkExpected();
  mutationStarted = true;
  try { git(["stash", "apply", ...(input.restoreIndex ? ["--index"] : []), input.stashSha]); }
  catch (error) { if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS"); throw error; }
  // Restore by immutable identity and retain the saved entry until explicitly deleted.
  checkExpected();
  return { stashSha: input.stashSha, dropped: false };
`);
