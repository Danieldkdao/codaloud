import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashPushCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  checkExpected();
  if (!git(["status", "--porcelain=v1", "--untracked-files=all"])) return { created: false, stashSha: null };
  const previousStash = optional(["rev-parse", "--verify", "--quiet", "refs/stash"]);
  mutationStarted = true;
  git(["stash", "push", "--include-untracked", "--message", input.message ?? "Codaloud saved changes"]);
  const stashSha = optional(["rev-parse", "--verify", "--quiet", "refs/stash"]);
  if (!stashSha || stashSha === previousStash || git(["status", "--porcelain=v1", "--untracked-files=all"])) fail("GIT_OUTCOME_UNKNOWN");
  checkExpected();
  return { created: true, stashSha };
`);
