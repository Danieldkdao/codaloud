import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitStashDropCommand } from "../git-stash-drop-command";
import { createGitFixture } from "./git-fixture";

let fixture: ReturnType<typeof createGitFixture>;
let stashSha: string;
beforeEach(() => {
  fixture = createGitFixture();
  fixture.write("file.txt", "saved\n");
  fixture.git("stash", "push", "-m", "First stash");
  stashSha = fixture.git("rev-parse", "refs/stash");
});
afterEach(() => fixture.cleanup());

it("deletes only the selected stash and preserves current staged and untracked work", () => {
  fixture.write("file.txt", "second\n");
  fixture.git("stash", "push", "-m", "Second stash");
  const newest = fixture.git("rev-parse", "refs/stash");
  fixture.write("file.txt", "current\n");
  fixture.git("add", "file.txt");
  fixture.write("new.txt", "unsaved\n");
  const before = fixture.git("status", "--porcelain");
  expect(fixture.run(sandboxGitStashDropCommand, { stashIndex: 1, stashSha })).toEqual({ stashSha, dropped: true });
  expect(fixture.git("stash", "list", "--format=%H")).toBe(newest);
  expect(fixture.git("status", "--porcelain")).toBe(before);
  expect(fixture.git("diff", "--cached")).toContain("current");
});

it("refuses a shifted stash index instead of deleting a different entry", () => {
  fixture.write("file.txt", "newer\n");
  fixture.git("stash", "push", "-m", "Newer");
  const before = fixture.git("stash", "list");
  expect(() => fixture.run(sandboxGitStashDropCommand, { stashIndex: 0, stashSha })).toThrow(expect.objectContaining({ code: "GIT_STASH_CHANGED" }));
  expect(fixture.git("stash", "list")).toBe(before);
});

it("reports a deleted stash without affecting another entry", () => {
  fixture.git("stash", "drop");
  expect(() => fixture.run(sandboxGitStashDropCommand, { stashIndex: 0, stashSha })).toThrow(expect.objectContaining({ code: "GIT_STASH_NOT_FOUND" }));
});
