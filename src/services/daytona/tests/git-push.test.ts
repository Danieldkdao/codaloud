import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitPushCommand } from "../git-push-command";
import { createGitRemoteFixture } from "./git-remote-fixture";
let fixture: ReturnType<typeof createGitRemoteFixture>;
beforeEach(() => { fixture = createGitRemoteFixture(); });
afterEach(() => fixture.cleanup());
const run = (input = {}) => fixture.run(sandboxGitPushCommand, { remoteBranch: "main", force: false, ...input });
it("pushes a fast-forward and returns refreshed counts", () => {
  fixture.git("commit", "--allow-empty", "-m", "Outgoing"); const tip = fixture.git("rev-parse", "HEAD");
  expect(run({ expectedHeadSha: tip })).toMatchObject({ pushed: true, remoteSha: tip, trackingUpdated: true, counts: { outgoing: 0, incoming: 0 } });
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
  expect(run({ expectedBranch: "new-branch", remoteBranch: "new-branch" })).toMatchObject({ pushed: true, counts: { upstream: "origin/new-branch", outgoing: 0 } });
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
  const result = fixture.run(sandboxGitPushCommand, { remoteBranch: "main", force: false }, hook);
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
  expect(() => fixture.run(sandboxGitPushCommand, { expectedHeadSha: tip, remoteBranch: "main", force: false }, hook)).toThrow(expect.objectContaining({ code: "GIT_OUTCOME_UNKNOWN" }));
  expect(fixture.remoteGit("rev-parse", "main")).toBe(tip);
});
