import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashPushCommand = createGitOperationCommand(String.raw`
  ensureIdle();
  checkExpected();
  if (!git(["status", "--porcelain=v1", "--untracked-files=all"])) return { created: false, stashSha: null, remainingChanges: false };
  // Git can reuse an identical stash commit without adding a reflog entry.
  // Report that saved state instead of treating an unchanged SHA as failure.
  const stashCount = () => git(["stash", "list", "--format=%H"]).split("\n").filter(Boolean).length;
  const previousCount = stashCount();
  mutationStarted = true;
  git(["stash", "push", "--include-untracked", "--message", input.message ?? "Codaloud saved changes"]);
  const stashSha = optional(["rev-parse", "--verify", "--quiet", "refs/stash"]);
  const currentCount = stashCount();
  if (currentCount < previousCount || currentCount > previousCount + 1 || (!stashSha && currentCount > previousCount)) fail("GIT_OUTCOME_UNKNOWN");
  checkExpected();
  const remainingChanges = Boolean(git(["status", "--porcelain=v1", "--untracked-files=all"]));
  const created = currentCount > previousCount;
  return { created, stashSha: created || !remainingChanges ? stashSha : null, remainingChanges };
`);
