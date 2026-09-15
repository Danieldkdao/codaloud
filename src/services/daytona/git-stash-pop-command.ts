import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashPopCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  checkExpected();
  ensureClean();
  const selection = () => git(["stash", "list", "--skip=" + input.stashIndex, "--max-count=1", "--format=%H"]).trim();
  if (!selection()) fail("GIT_STASH_NOT_FOUND");
  if (selection() !== input.stashSha) fail("GIT_STASH_CHANGED");
  mutationStarted = true;
  try { git(["stash", "apply", ...(input.restoreIndex ? ["--index"] : []), input.stashSha]); }
  catch (error) { if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS"); throw error; }
  // Apply by immutable identity, then verify the reflog slot before dropping it.
  checkExpected();
  if (selection() !== input.stashSha) fail("GIT_STASH_CHANGED");
  git(["stash", "drop", "stash@{" + input.stashIndex + "}"]);
  return { stashSha: input.stashSha, dropped: true };
`);
