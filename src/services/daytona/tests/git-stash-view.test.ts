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
