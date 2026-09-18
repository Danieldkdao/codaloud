import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashDropCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  captureCurrentState();
  const selectedSha = git(["stash", "list", "--skip=" + input.stashIndex, "--max-count=1", "--format=%H"]).trim();
  if (!selectedSha) fail("GIT_STASH_NOT_FOUND");
  // Reflog indexes move after another stash is saved or deleted. Never drop by index alone.
  if (selectedSha !== input.stashSha) fail("GIT_STASH_CHANGED");
  checkExpected();
  mutationStarted = true;
  git(["stash", "drop", "stash@{" + input.stashIndex + "}"]);
  return { stashSha: input.stashSha, dropped: true };
`);
