import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitPullCommand } from "../git-pull-command";
import { createGitRemoteFixture } from "./git-remote-fixture";
let fixture: ReturnType<typeof createGitRemoteFixture>;
beforeEach(() => { fixture = createGitRemoteFixture(); });
afterEach(() => fixture.cleanup());
const remoteCommit = (file = "remote.txt", content = "remote\n") => {
  fixture.write(file, content); fixture.git("add", "."); fixture.git("commit", "-m", "Remote");
  const sha = fixture.git("rev-parse", "HEAD"); fixture.git("push", fixture.remotePath, "main"); fixture.git("reset", "--hard", fixture.headSha); return sha;
};
const run = (rebase = false) => fixture.run(sandboxGitPullCommand, { remoteBranch: "main", rebase, expectedHeadSha: fixture.git("rev-parse", "HEAD") });
it.each([false, true])("fast-forwards clean work with rebase=%s and refreshes counts", (rebase) => {
  const sha = remoteCommit(); expect(run(rebase)).toMatchObject({ headSha: sha, counts: { incoming: 0, outgoing: 0 } });
  expect(fixture.git("show", "HEAD:remote.txt")).toBe("remote");
});
it("merges divergent history with both parents", () => {
  const remoteSha = remoteCommit(); fixture.write("local.txt", "local\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Local");
  const localSha = fixture.git("rev-parse", "HEAD"); run();
  expect(fixture.git("show", "-s", "--format=%P")).toBe(localSha + " " + remoteSha);
});
it("rebases local commits on remote history", () => {
  const remoteSha = remoteCommit(); fixture.write("local.txt", "local\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Local");
  const localSha = fixture.git("rev-parse", "HEAD"); const result = run(true);
  expect(result.headSha).not.toBe(localSha); expect(fixture.git("rev-parse", "HEAD^")).toBe(remoteSha);
  expect(result.counts).toMatchObject({ outgoing: 1, incoming: 0 });
});
it.each([false, true])("reports conflicts without discarding work, rebase=%s", (rebase) => {
  remoteCommit("file.txt", "remote\n"); fixture.write("file.txt", "local\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Local");
  expect(() => run(rebase)).toThrow(expect.objectContaining({ code: "GIT_CONFLICTS" }));
  expect(fixture.git("ls-files", "--unmerged")).not.toBe("");
});
it("rejects dirty work before fetching", () => {
  remoteCommit(); fixture.write("file.txt", "keep\n");
  expect(() => run()).toThrow(expect.objectContaining({ code: "GIT_DIRTY_WORKTREE" }));
  expect(fixture.git("for-each-ref", "refs/remotes/origin")).toBe("");
});
