import { createGitOperationCommand } from "./git-command";
import { sandboxGitRemoteRuntime } from "./git-remote-command";

export const sandboxGitPushCommand = createGitOperationCommand(sandboxGitRemoteRuntime + String.raw`
  ensureIdle();
  const currentState = captureCurrentState();
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") fail("GIT_HISTORY_INCOMPLETE");
  const remoteBranchName = resolveRemoteBranch(currentState.branchName, true);
  const target = "refs/heads/" + remoteBranchName;
  const trackingRef = "refs/remotes/origin/" + remoteBranchName;
  const previousTracking = optional(["rev-parse", "--verify", "--quiet", trackingRef]);
  prepareRemote();
  // Copy the selected commit without credentials before contacting GitHub.
  git(["-c", "protocol.file.allow=always", "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", workspace,
    currentState.headSha + ":refs/heads/codaloud-push"], temporary);
  checkExpected();
  mutationStarted = true;
  try {
    network(["push", "--porcelain", "--no-follow-tags", "--recurse-submodules=no",
      ...(input.force ? ["--force-with-lease=" + target + ":" + (input.expectedRemoteSha ?? "")] : []),
      input.remote.cloneUrl, currentState.headSha + ":" + target]);
  } catch (error) {
    if (String(error.stdout || "").split("\n").some((line) => line.startsWith("!\t"))) fail("GIT_REMOTE_REJECTED");
    fail("GIT_OUTCOME_UNKNOWN");
  }
  // A confirmed push stays successful if refreshing local metadata fails.
  let trackingUpdated = false;
  let refreshedCounts = null;
  try {
    checkExpected();
    git(["update-ref", trackingRef, currentState.headSha, previousTracking ?? "0".repeat(currentState.headSha.length)]);
    git(["config", "branch." + currentState.branchName + ".remote", "origin"]);
    git(["config", "branch." + currentState.branchName + ".merge", target]);
    const mapping = "+" + target + ":" + trackingRef;
    const mappings = optional(["config", "--get-all", "remote.origin.fetch"])?.split("\n") ?? [];
    if (!mappings.includes(mapping) && !mappings.includes("+refs/heads/*:refs/remotes/origin/*")) git(["config", "--add", "remote.origin.fetch", mapping]);
    refreshedCounts = counts();
    trackingUpdated = true;
  } catch {}
  return { pushed: true, remoteBranch: remoteBranchName, remoteSha: currentState.headSha, trackingUpdated, counts: refreshedCounts };
`);
