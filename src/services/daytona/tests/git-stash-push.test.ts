import { afterEach, beforeEach, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxGitStashPushCommand } from "../git-stash-push-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
it("stashes staged, unstaged and untracked work while preserving ignored files", () => {
  fixture.write(".git/info/exclude", "ignored.txt\n");
  fixture.write("ignored.txt", "keep\n"); fixture.write("new.txt", "new\n");
  fixture.write("file.txt", "staged\n"); fixture.git("add", "file.txt"); fixture.write("file.txt", "unstaged\n");
  const result = fixture.run(sandboxGitStashPushCommand, { message: "Save 'work' $(touch hacked)" });
  expect(result.created).toBe(true);
  expect(result.stashSha).toBe(fixture.git("rev-parse", "refs/stash"));
  expect(fixture.git("status", "--porcelain")).toBe("");
  expect(readFileSync(join(fixture.repositoryPath, "ignored.txt"), "utf8")).toBe("keep\n");
  expect(existsSync(join(fixture.repositoryPath, "hacked"))).toBe(false);
});
it("returns an explicit no-op without duplicating an existing stash", () => {
  expect(fixture.run(sandboxGitStashPushCommand)).toMatchObject({ created: false, stashSha: null });
});
it("stashes changes from the currently checked-out feature branch", () => {
  fixture.git("switch", "-c", "feature/work");
  fixture.git("commit", "--allow-empty", "-m", "Latest");
  fixture.write("file.txt", "work\n");
  expect(fixture.run(sandboxGitStashPushCommand, {})).toMatchObject({ created: true });
  expect(fixture.git("stash", "list")).toContain("feature/work");
  expect(fixture.git("branch", "--show-current")).toBe("feature/work");
});

it("confirms a stash when restoring ignore rules makes a preserved file untracked", () => {
  fixture.write(".gitignore", "old-ignore\n"); fixture.git("add", ".gitignore"); fixture.git("commit", "-m", "Ignore rules");
  fixture.write(".gitignore", "precious.txt\n"); fixture.write("precious.txt", "preserved\n");
  expect(fixture.run(sandboxGitStashPushCommand, {})).toMatchObject({ created: true, remainingChanges: true });
  expect(readFileSync(join(fixture.repositoryPath, "precious.txt"), "utf8")).toBe("preserved\n");
});

it("confirms work is saved when Git reuses an identical stash commit", () => {
  const hook = `
const cp = require("node:child_process");
const executeGit = cp.execFileSync;
cp.execFileSync = (file, args, options) => executeGit(file, args, { ...options, env: { ...options.env,
  GIT_AUTHOR_DATE: "2026-09-15T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-15T00:00:00Z" } });
`;
  fixture.write("file.txt", "repeat\n");
  const first = fixture.run(sandboxGitStashPushCommand, { message: "Same" }, hook);
  fixture.write("file.txt", "repeat\n");
  const second = fixture.run(sandboxGitStashPushCommand, { message: "Same" }, hook);
  expect(second).toMatchObject({ created: false, stashSha: first.stashSha, remainingChanges: false });
  expect(fixture.git("stash", "list").split("\n")).toHaveLength(1);
});
