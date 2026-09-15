import { createGitOperationCommand } from "./git-command";
import { sandboxGitRemoteRuntime } from "./git-remote-command";

export const sandboxGitPushCommand = createGitOperationCommand(sandboxGitRemoteRuntime + String.raw`
  ensureIdle();
  checkExpected();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  const target = remoteBranch();
  const trackingRef = "refs/remotes/origin/" + input.remoteBranch;
  const previousTracking = optional(["rev-parse", "--verify", "--quiet", trackingRef]);
  prepareRemote();
  // Copy the selected commit without credentials before contacting GitHub.
  git(["-c", "protocol.file.allow=always", "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", workspace,
    input.expectedHeadSha + ":refs/heads/codaloud-push"], temporary);
  checkExpected();
  mutationStarted = true;
  try {
    network(["push", "--porcelain", "--no-follow-tags", "--recurse-submodules=no",
      ...(input.force ? ["--force-with-lease=" + target + ":" + (input.expectedRemoteSha ?? "")] : []),
      input.remote.cloneUrl, input.expectedHeadSha + ":" + target]);
  } catch (error) {
    if (String(error.stdout || "").split("\n").some((line) => line.startsWith("!\t"))) fail("GIT_REMOTE_REJECTED");
    fail("GIT_OUTCOME_UNKNOWN");
  }
  // A confirmed push stays successful if refreshing local metadata fails.
  let trackingUpdated = false;
  let refreshedCounts = null;
  try {
    checkExpected();
    git(["update-ref", trackingRef, input.expectedHeadSha, previousTracking ?? "0".repeat(input.expectedHeadSha.length)]);
    git(["config", "branch." + input.expectedBranch + ".remote", "origin"]);
    git(["config", "branch." + input.expectedBranch + ".merge", target]);
    const mapping = "+" + target + ":" + trackingRef;
    const mappings = optional(["config", "--get-all", "remote.origin.fetch"])?.split("\n") ?? [];
    if (!mappings.includes(mapping) && !mappings.includes("+refs/heads/*:refs/remotes/origin/*")) git(["config", "--add", "remote.origin.fetch", mapping]);
    refreshedCounts = counts();
    trackingUpdated = true;
  } catch {}
  return { pushed: true, remoteBranch: input.remoteBranch, remoteSha: input.expectedHeadSha, trackingUpdated, counts: refreshedCounts };
`);
