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
