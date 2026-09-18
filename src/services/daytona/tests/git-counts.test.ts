import { afterEach, beforeEach, expect, it } from "vitest";
import { createGitFixture } from "./git-fixture";
import { sandboxGitCountsCommand } from "../git-counts-command";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
it("reports an untracked branch without inventing zero remote counts", () => {
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ currentBranch: "main", headSha: fixture.headSha, upstream: null, outgoing: null, incoming: null, isShallow: false });
});
it("counts divergence against the configured upstream, even with a different name", () => {
  fixture.git("update-ref", "refs/remotes/origin/trunk", fixture.headSha);
  fixture.git("config", "remote.origin.url", "https://github.com/example/repo.git");
  fixture.git("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  fixture.git("config", "branch.main.remote", "origin");
  fixture.git("config", "branch.main.merge", "refs/heads/trunk");
  fixture.git("commit", "--allow-empty", "-m", "Outgoing");
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ upstream: "origin/trunk", outgoing: 1, incoming: 0 });
});
it("does not claim exact counts for shallow history", () => {
  fixture.write(".git/shallow", fixture.headSha + "\n");
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ outgoing: null, incoming: null, isShallow: true });
});
it("honors an operation lock and leaves it intact", () => {
  fixture.write(".git/codaloud-operation.lock", "busy");
  expect(() => fixture.run(sandboxGitCountsCommand)).toThrow(expect.objectContaining({ code: "GIT_BUSY" }));
});
it("rejects executable workspace configuration", () => {
  fixture.git("config", "filter.evil.clean", "touch stolen");
  expect(() => fixture.run(sandboxGitCountsCommand)).toThrow(expect.objectContaining({ code: "GIT_UNSUPPORTED_CONFIG" }));
});

it("distinguishes outgoing and incoming commits on divergent branches", () => {
  fixture.git("branch", "remote-side");
  fixture.git("commit", "--allow-empty", "-m", "Local");
  fixture.git("switch", "remote-side"); fixture.git("commit", "--allow-empty", "-m", "Remote");
  fixture.git("update-ref", "refs/remotes/origin/main", fixture.git("rev-parse", "HEAD")); fixture.git("switch", "main");
  fixture.git("config", "remote.origin.url", "https://github.com/example/repo.git");
  fixture.git("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  fixture.git("config", "branch.main.remote", "origin"); fixture.git("config", "branch.main.merge", "refs/heads/main");
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ outgoing: 1, incoming: 1 });
});
it("handles detached HEAD and unborn branches explicitly", () => {
  fixture.git("switch", "--detach", "HEAD");
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ currentBranch: null, headSha: fixture.headSha, outgoing: null, incoming: null });
  fixture.git("switch", "--orphan", "empty");
  expect(fixture.run(sandboxGitCountsCommand)).toMatchObject({ currentBranch: "empty", headSha: null, outgoing: null, incoming: null });
});
