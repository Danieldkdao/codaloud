import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitStashPopCommand } from "../git-stash-pop-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
let stashSha: string;
beforeEach(() => {
  fixture = createGitFixture(); fixture.write("file.txt", "saved\n"); fixture.git("add", "file.txt");
  fixture.git("stash", "push"); stashSha = fixture.git("rev-parse", "refs/stash");
});
afterEach(() => fixture.cleanup());
it("applies the selected stash and drops it only after success", () => {
  const result = fixture.run(sandboxGitStashPopCommand, { stashIndex: 0, stashSha, restoreIndex: true });
  expect(result).toEqual({ stashSha, dropped: true });
  expect(fixture.git("diff", "--cached")).toContain("saved");
  expect(fixture.git("stash", "list")).toBe("");
});
it("retains the stash and reports conflicts", () => {
  fixture.write("file.txt", "competing\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Competing");
  expect(() => fixture.run(sandboxGitStashPopCommand, { stashIndex: 0, stashSha })).toThrow(expect.objectContaining({ code: "GIT_CONFLICTS" }));
  expect(fixture.git("rev-parse", "refs/stash")).toBe(stashSha);
  expect(fixture.git("ls-files", "--unmerged")).not.toBe("");
});
it("rejects a stale index without applying another stash", () => {
  expect(() => fixture.run(sandboxGitStashPopCommand, { stashIndex: 0, stashSha: fixture.headSha })).toThrow(expect.objectContaining({ code: "GIT_STASH_CHANGED" }));
  expect(fixture.git("status", "--porcelain")).toBe("");
});
it("keeps dirty work intact", () => {
  fixture.write("file.txt", "current\n");
  expect(() => fixture.run(sandboxGitStashPopCommand, { stashIndex: 0, stashSha })).toThrow(expect.objectContaining({ code: "GIT_DIRTY_WORKTREE" }));
});

it("applies the selected stash to the currently checked-out branch", () => {
  fixture.git("switch", "-c", "feature/target");
  fixture.git("commit", "--allow-empty", "-m", "Target");
  expect(fixture.run(sandboxGitStashPopCommand, { stashIndex: 0, stashSha })).toMatchObject({ dropped: true });
  expect(fixture.git("branch", "--show-current")).toBe("feature/target");
  expect(fixture.git("diff")).toContain("saved");
});
