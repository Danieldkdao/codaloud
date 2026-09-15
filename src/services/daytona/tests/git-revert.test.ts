import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitRevertCommand } from "../git-revert-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
it("reverts a root commit by adding an inverse commit", () => {
  const result = fixture.run(sandboxGitRevertCommand);
  expect(result.parentHash).toBe(fixture.headSha);
  expect(fixture.git("ls-tree", "--name-only", "HEAD")).toBe("");
  expect(fixture.git("rev-list", "--count", "HEAD")).toBe("2");
  expect(fixture.git("log", "-1", "--format=%an <%ae>")).toBe("Ada <ada@example.com>");
  const next = fixture.run(sandboxGitRevertCommand);
  expect(next.parentHash).toBe(result.hash);
  expect(fixture.git("show", "HEAD:file.txt")).toBe("base");
});
it("reverts ordinary changes while preserving history", () => {
  fixture.write("file.txt", "new\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Change");
  fixture.run(sandboxGitRevertCommand, {});
  expect(fixture.git("show", "HEAD:file.txt")).toBe("base");
  expect(fixture.git("rev-list", "--count", "HEAD")).toBe("3");
});
it("requires a deliberate mainline for a merge commit", () => {
  fixture.git("switch", "-c", "side"); fixture.write("side.txt", "side\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Side");
  fixture.git("switch", "main"); fixture.git("merge", "--no-ff", "side", "-m", "Merge");
  expect(() => fixture.run(sandboxGitRevertCommand, {})).toThrow(expect.objectContaining({ code: "GIT_MERGE_MAINLINE_REQUIRED" }));
  fixture.run(sandboxGitRevertCommand, { mainline: 1 });
  expect(fixture.git("ls-tree", "--name-only", "HEAD")).toBe("file.txt");
});
it("refuses dirty work and incomplete shallow history", () => {
  fixture.write("file.txt", "keep\n");
  expect(() => fixture.run(sandboxGitRevertCommand)).toThrow(expect.objectContaining({ code: "GIT_DIRTY_WORKTREE" }));
  fixture.git("restore", "file.txt"); fixture.write(".git/shallow", fixture.headSha + "\n");
  expect(() => fixture.run(sandboxGitRevertCommand)).toThrow(expect.objectContaining({ code: "GIT_HISTORY_INCOMPLETE" }));
});

it("reverts the latest commit on the checked-out feature branch without client state", () => {
  fixture.git("switch", "-c", "feature/current");
  fixture.write("file.txt", "feature\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Feature");
  const previous = fixture.git("rev-parse", "HEAD");
  expect(fixture.run(sandboxGitRevertCommand, {})).toMatchObject({ parentHash: previous, currentBranch: "feature/current" });
  expect(fixture.git("show", "HEAD:file.txt")).toBe("base");
  expect(fixture.git("rev-parse", "main")).toBe(fixture.headSha);
});
