import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitFetchCommand } from "../git-fetch-command";
import { createGitRemoteFixture } from "./git-remote-fixture";
let fixture: ReturnType<typeof createGitRemoteFixture>;
beforeEach(() => { fixture = createGitRemoteFixture(); });
afterEach(() => fixture.cleanup());
it("fetches all remote branches without moving HEAD or touching dirty files", () => {
  fixture.remoteGit("branch", "another", "main");
  fixture.write("file.txt", "keep editing\n");
  const result = fixture.run(sandboxGitFetchCommand);
  expect(result).toMatchObject({ headSha: fixture.headSha, incoming: 0, outgoing: 0 });
  expect(fixture.git("rev-parse", "refs/remotes/origin/another")).toBe(fixture.headSha);
  expect(fixture.git("diff")).toContain("keep editing");
});
it("prunes deleted remote tracking branches without deleting local branches", () => {
  fixture.git("update-ref", "refs/remotes/origin/gone", fixture.headSha);
  fixture.git("branch", "gone");
  fixture.run(sandboxGitFetchCommand);
  expect(fixture.git("branch", "--list", "gone")).not.toBe("");
  expect(fixture.git("for-each-ref", "refs/remotes/origin/gone")).toBe("");
});
it("rejects a mismatched remote before authenticated transport", () => {
  fixture.git("remote", "set-url", "origin", "https://github.com/other/repo.git");
  expect(() => fixture.run(sandboxGitFetchCommand)).toThrow(expect.objectContaining({ code: "GIT_REMOTE_MISMATCH" }));
});

it("unshallows from complete origin history before returning exact counts", () => {
  fixture.git("commit", "--allow-empty", "-m", "Second"); const tip = fixture.git("rev-parse", "HEAD");
  fixture.git("push", fixture.remotePath, "main"); fixture.write(".git/shallow", tip + "\n");
  expect(fixture.run(sandboxGitFetchCommand, {})).toMatchObject({ isShallow: false, outgoing: 0, incoming: 0 });
  expect(fixture.git("rev-list", "--count", "HEAD")).toBe("2");
});

it("fetches and reports state for the checked-out feature branch without client state", () => {
  fixture.git("switch", "-c", "feature/current");
  fixture.git("commit", "--allow-empty", "-m", "Local feature");
  const tip = fixture.git("rev-parse", "HEAD");
  expect(fixture.run(sandboxGitFetchCommand, {})).toMatchObject({ currentBranch: "feature/current", headSha: tip });
  expect(fixture.git("rev-parse", "main")).toBe(fixture.headSha);
});
