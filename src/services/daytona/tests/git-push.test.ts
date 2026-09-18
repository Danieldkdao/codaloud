import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitPushCommand } from "../git-push-command";
import { createGitRemoteFixture } from "./git-remote-fixture";
let fixture: ReturnType<typeof createGitRemoteFixture>;
beforeEach(() => { fixture = createGitRemoteFixture(); });
afterEach(() => fixture.cleanup());
const run = (input = {}) => fixture.run(sandboxGitPushCommand, { force: false, ...input });
it("pushes a fast-forward and returns refreshed counts", () => {
  fixture.git("commit", "--allow-empty", "-m", "Outgoing"); const tip = fixture.git("rev-parse", "HEAD");
  expect(run({})).toMatchObject({ pushed: true, remoteSha: tip, trackingUpdated: true, counts: { outgoing: 0, incoming: 0 } });
  expect(fixture.remoteGit("rev-parse", "main")).toBe(tip);
});
it("rejects ordinary non-fast-forward pushes", () => {
  fixture.git("commit", "--allow-empty", "-m", "Remote"); fixture.git("push", fixture.remotePath, "main"); fixture.git("reset", "--hard", fixture.headSha);
  expect(() => run()).toThrow(expect.objectContaining({ code: "GIT_REMOTE_REJECTED" }));
});
it("force pushes only when the explicitly observed remote SHA still matches", () => {
  fixture.git("commit", "--allow-empty", "-m", "Remote"); const remoteSha = fixture.git("rev-parse", "HEAD");
  fixture.git("push", fixture.remotePath, "main"); fixture.git("reset", "--hard", fixture.headSha);
  expect(() => run({ force: true, expectedRemoteSha: fixture.headSha })).toThrow(expect.objectContaining({ code: "GIT_REMOTE_REJECTED" }));
  expect(fixture.remoteGit("rev-parse", "main")).toBe(remoteSha);
  expect(run({ force: true, expectedRemoteSha: remoteSha })).toMatchObject({ pushed: true, remoteSha: fixture.headSha });
});
it("publishes a new branch and records its upstream", () => {
  fixture.git("switch", "-c", "new-branch");
  expect(run({})).toMatchObject({ pushed: true, counts: { upstream: "origin/new-branch", outgoing: 0 } });
  expect(fixture.remoteGit("rev-parse", "new-branch")).toBe(fixture.headSha);
});
it("ignores a configured push URL when choosing the trusted destination", () => {
  fixture.git("config", "remote.origin.pushurl", "https://evil.invalid/repo.git");
  expect(run().pushed).toBe(true);
});

it("keeps a confirmed push successful when local tracking configuration cannot be refreshed", () => {
  const hook = `
const pushExecute = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  const result = pushExecute(file, args, options);
  if (args.includes("push") && args.includes("https://github.com/example/repo.git")) {
    require("node:fs").writeFileSync(${JSON.stringify(fixture.repositoryPath + "/.git/config.lock")}, "busy");
  }
  return result;
};`;
  const result = fixture.run(sandboxGitPushCommand, { force: false }, hook);
  expect(result).toMatchObject({ pushed: true, trackingUpdated: false, counts: null });
  expect(fixture.remoteGit("rev-parse", "main")).toBe(fixture.headSha);
});
it("treats a lost push response as unknown without retrying the remote mutation", () => {
  fixture.git("commit", "--allow-empty", "-m", "Outgoing"); const tip = fixture.git("rev-parse", "HEAD");
  const hook = `
const pushExecute = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  const result = pushExecute(file, args, options);
  if (args.includes("push") && args.includes("https://github.com/example/repo.git")) throw new Error("Response lost");
  return result;
};`;
  expect(() => fixture.run(sandboxGitPushCommand, { force: false }, hook)).toThrow(expect.objectContaining({ code: "GIT_OUTCOME_UNKNOWN" }));
  expect(fixture.remoteGit("rev-parse", "main")).toBe(tip);
});

it("pushes the checked-out branch to its differently named upstream", () => {
  fixture.remoteGit("branch", "review", "main");
  fixture.git("switch", "-c", "feature/current");
  fixture.git("config", "branch.feature/current.remote", "origin");
  fixture.git("config", "branch.feature/current.merge", "refs/heads/review");
  fixture.git("commit", "--allow-empty", "-m", "Feature");
  const tip = fixture.git("rev-parse", "HEAD");
  expect(fixture.run(sandboxGitPushCommand, { force: false })).toMatchObject({ pushed: true, remoteBranch: "review", remoteSha: tip });
  expect(fixture.remoteGit("rev-parse", "review")).toBe(tip);
  expect(fixture.remoteGit("rev-parse", "main")).toBe(fixture.headSha);
});
it("first push derives the destination name from the checked-out branch", () => {
  fixture.git("switch", "-c", "feature/first");
  expect(fixture.run(sandboxGitPushCommand, {})).toMatchObject({ pushed: true, remoteBranch: "feature/first" });
  expect(fixture.git("config", "branch.feature/first.merge")).toBe("refs/heads/feature/first");
});
it.each(["other remote", "multiple upstreams", "partial configuration"])("rejects ambiguous upstream: %s", (scenario) => {
  if (scenario === "other remote") fixture.git("config", "branch.main.remote", "other");
  else if (scenario === "multiple upstreams") fixture.git("config", "--add", "branch.main.merge", "refs/heads/other");
  else fixture.git("config", "--unset", "branch.main.merge");
  expect(() => run()).toThrow(expect.objectContaining({ code: "GIT_UPSTREAM_REQUIRED" }));
});
