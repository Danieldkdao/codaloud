import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitStashViewCommand } from "../git-stash-view-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
const list = (input = {}) => fixture.run(sandboxGitStashViewCommand, { offset: 0, pageSize: 20, ...input });
it("returns an empty collection with no stash", () => { expect(list()).toEqual({ stashes: [], nextOffset: null, patch: null }); });
it("pages stash entries and previews tracked and untracked changes", () => {
  fixture.write("file.txt", "changed\n"); fixture.write("new.txt", "untracked\n");
  fixture.git("stash", "push", "-u", "-m", "First");
  const sha = fixture.git("rev-parse", "stash@{0}");
  fixture.write("file.txt", "second\n"); fixture.git("stash", "push", "-m", "Second");
  const page = list({ pageSize: 1 });
  expect(page.nextOffset).toBe(1);
  expect(page.stashes[0].index).toBe(0);
  const detail = list({ index: 1, stashSha: sha });
  expect(detail.patch).toContain("untracked"); expect(detail.patch).toContain("changed");
  expect(fixture.git("stash", "list").split("\n")).toHaveLength(2);
});
it("rejects a stale stash index instead of displaying a different stash", () => {
  fixture.write("file.txt", "changed\n"); fixture.git("stash", "push");
  expect(() => list({ index: 0, stashSha: fixture.headSha })).toThrow(expect.objectContaining({ code: "GIT_STASH_CHANGED" }));
});

it("filters messages before pagination while retaining real stash indices for detail", () => {
  for (const message of ["Login oldest", "unrelated", "LOGIN newest", "another change"]) {
    fixture.write("file.txt", message + "\n");
    fixture.git("stash", "push", "-m", message);
  }
  // User date preferences must not turn reflog selectors into timestamps.
  fixture.git("config", "log.date", "iso");
  const first = list({ search: "login", pageSize: 1 });
  expect(first.stashes).toHaveLength(1);
  expect(first.stashes[0]).toMatchObject({ index: 1, message: "On main: LOGIN newest" });
  expect(first.nextOffset).toBe(1);
  const second = list({ search: "login", pageSize: 1, offset: first.nextOffset });
  expect(second.stashes).toHaveLength(1);
  expect(second.stashes[0]).toMatchObject({ index: 3, message: "On main: Login oldest" });
  expect(second.nextOffset).toBeNull();
  expect(list({ index: second.stashes[0].index, stashSha: second.stashes[0].sha }).patch).toContain("Login oldest");
  expect(list({ search: "login", offset: 2 })).toEqual({ stashes: [], nextOffset: null, patch: null });
});

it("treats search as literal text and returns no matches as an empty page", () => {
  for (const message of ["fix [a].* --all $(whoami) café", "fix aaaaa", "other"]) {
    fixture.write("file.txt", message + "\n");
    fixture.git("stash", "push", "-m", message);
  }
  const page = list({ search: "[a].* --all $(whoami) café" });
  expect(page.stashes).toHaveLength(1);
  expect(page.stashes[0].index).toBe(2);
  expect(list({ search: "missing" })).toEqual({ stashes: [], nextOffset: null, patch: null });
  expect(list({ search: "" })).toEqual(list());
});
