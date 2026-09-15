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
  expect(() => fixture.run(sandboxGitRevertCommand)).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
});
it("reverts ordinary changes while preserving history", () => {
  fixture.write("file.txt", "new\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Change");
  fixture.run(sandboxGitRevertCommand, { expectedHeadSha: fixture.git("rev-parse", "HEAD") });
  expect(fixture.git("show", "HEAD:file.txt")).toBe("base");
  expect(fixture.git("rev-list", "--count", "HEAD")).toBe("3");
});
it("requires a deliberate mainline for a merge commit", () => {
  fixture.git("switch", "-c", "side"); fixture.write("side.txt", "side\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Side");
  fixture.git("switch", "main"); fixture.git("merge", "--no-ff", "side", "-m", "Merge");
  const expectedHeadSha = fixture.git("rev-parse", "HEAD");
  expect(() => fixture.run(sandboxGitRevertCommand, { expectedHeadSha })).toThrow(expect.objectContaining({ code: "GIT_MERGE_MAINLINE_REQUIRED" }));
  fixture.run(sandboxGitRevertCommand, { expectedHeadSha, mainline: 1 });
  expect(fixture.git("ls-tree", "--name-only", "HEAD")).toBe("file.txt");
});
it("refuses dirty work and incomplete shallow history", () => {
  fixture.write("file.txt", "keep\n");
  expect(() => fixture.run(sandboxGitRevertCommand)).toThrow(expect.objectContaining({ code: "GIT_DIRTY_WORKTREE" }));
  fixture.git("restore", "file.txt"); fixture.write(".git/shallow", fixture.headSha + "\n");
  expect(() => fixture.run(sandboxGitRevertCommand)).toThrow(expect.objectContaining({ code: "GIT_HISTORY_INCOMPLETE" }));
});
