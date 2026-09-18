import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitUndoCommand } from "../git-undo-command";
import { createGitFixture } from "./git-fixture";

let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());

const commitChange = () => {
  fixture.write("file.txt", "committed\n");
  fixture.git("add", ".");
  fixture.git("commit", "-m", "Change");
  return fixture.git("rev-parse", "HEAD");
};
const contents = (name = "file.txt") => readFileSync(join(fixture.repositoryPath, name), "utf8");

it.each(["soft", "mixed", "hard"])("undoes exactly the latest commit with %s semantics", (mode) => {
  const previousHeadSha = commitChange();
  fixture.git("update-ref", "refs/remotes/origin/main", previousHeadSha);
  const result = fixture.run(sandboxGitUndoCommand, { mode });
  expect(result).toEqual({ previousHeadSha, headSha: fixture.headSha, currentBranch: "main", mode });
  expect(fixture.git("rev-list", "--count", "HEAD")).toBe("1");
  expect(fixture.git("rev-parse", "ORIG_HEAD")).toBe(previousHeadSha);
  expect(fixture.git("rev-parse", "refs/remotes/origin/main")).toBe(previousHeadSha);
  expect(contents()).toBe(mode === "hard" ? "base\n" : "committed\n");
  expect(fixture.git("show", ":file.txt")).toBe(mode === "soft" ? "committed" : "base");
});

it.each(["soft", "mixed", "hard"])("handles existing staged and unstaged edits with %s semantics", (mode) => {
  commitChange();
  fixture.write("file.txt", "staged\n");
  fixture.git("add", "file.txt");
  fixture.write("file.txt", "unstaged\n");
  fixture.write("untracked.txt", "keep\n");
  fixture.run(sandboxGitUndoCommand, { mode });
  expect(contents()).toBe(mode === "hard" ? "base\n" : "unstaged\n");
  expect(fixture.git("show", ":file.txt")).toBe(mode === "soft" ? "staged" : "base");
  expect(contents("untracked.txt")).toBe("keep\n");
});

it("hard reset replaces an untracked obstruction but preserves unrelated ignored files", () => {
  fixture.git("rm", "file.txt");
  fixture.git("commit", "-m", "Remove file");
  mkdirSync(join(fixture.repositoryPath, "file.txt"));
  fixture.write("file.txt/obstruction.txt", "removed by reset\n");
  fixture.write(".git/info/exclude", "ignored.txt\n");
  fixture.write("ignored.txt", "keep\n");
  fixture.run(sandboxGitUndoCommand, { mode: "hard" });
  expect(contents()).toBe("base\n");
  expect(contents("ignored.txt")).toBe("keep\n");
});

it.each(["soft", "mixed", "hard"])("rejects undo of the root commit in %s mode without changing files", (mode) => {
  fixture.write("file.txt", "keep\n");
  expect(() => fixture.run(sandboxGitUndoCommand, { mode })).toThrow(expect.objectContaining({ code: "GIT_PARENT_REQUIRED" }));
  expect(fixture.git("rev-parse", "HEAD")).toBe(fixture.headSha);
  expect(contents()).toBe("keep\n");
});

it.each(["detached", "unborn"])("rejects %s state", (state) => {
  commitChange();
  if (state === "detached") fixture.git("switch", "--detach", "HEAD");
  else fixture.git("switch", "--orphan", "empty");
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "soft" })).toThrow(expect.objectContaining({ code: "GIT_BRANCH_REQUIRED" }));
});

it("rejects incomplete shallow history", () => {
  const tip = commitChange();
  fixture.write(".git/shallow", tip + "\n");
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "hard" })).toThrow(expect.objectContaining({ code: "GIT_HISTORY_INCOMPLETE" }));
  expect(fixture.git("rev-parse", "HEAD")).toBe(tip);
  expect(contents()).toBe("committed\n");
});

it("undoes a merge to the first parent of the checked-out feature branch", () => {
  fixture.git("switch", "-c", "feature/current");
  const firstParent = commitChange();
  fixture.git("switch", "-c", "side", fixture.headSha);
  fixture.write("side.txt", "side\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Side");
  fixture.git("switch", "feature/current"); fixture.git("merge", "--no-ff", "side", "-m", "Merge");
  const previousHeadSha = fixture.git("rev-parse", "HEAD");
  expect(fixture.run(sandboxGitUndoCommand, { mode: "mixed" })).toEqual({ previousHeadSha, headSha: firstParent, currentBranch: "feature/current", mode: "mixed" });
  expect(fixture.git("rev-parse", "main")).toBe(fixture.headSha);
  expect(contents("side.txt")).toBe("side\n");
});

it.each(["MERGE_HEAD", "REVERT_HEAD", "rebase-merge"])("rejects an unfinished operation marked by %s", (marker) => {
  const tip = commitChange();
  fixture.write(".git/" + marker, tip + "\n");
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "hard" })).toThrow(expect.objectContaining({ code: "GIT_OPERATION_IN_PROGRESS" }));
  expect(fixture.git("rev-parse", "HEAD")).toBe(tip);
});

it("honors another operation's lock", () => {
  const tip = commitChange();
  fixture.write(".git/codaloud-operation.lock", "busy");
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "hard" })).toThrow(expect.objectContaining({ code: "GIT_BUSY" }));
  expect(fixture.git("rev-parse", "HEAD")).toBe(tip);
  expect(existsSync(join(fixture.repositoryPath, ".git/codaloud-operation.lock"))).toBe(true);
});

it("captures state under the lock and refuses a branch switch before reset", () => {
  const tip = commitChange();
  fixture.git("branch", "other");
  const hook = `
const cp = require("node:child_process");
const original = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  if (args.includes("symbolic-ref") && !require("node:fs").existsSync(${JSON.stringify(join(fixture.repositoryPath, ".git/codaloud-operation.lock"))})) throw new Error("State read outside lock");
  if (args.includes(${JSON.stringify(tip + "^1^{commit}")})) original("git", ["switch", "other"], options);
  return original(file, args, options);
};`;
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "hard" }, hook)).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
  expect(fixture.git("rev-parse", "main")).toBe(tip);
  expect(fixture.git("rev-parse", "other")).toBe(tip);
});

it("reports an unknown outcome if execution fails after reset without resetting twice", () => {
  commitChange();
  const hook = `
const cp = require("node:child_process");
const original = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  const result = original(file, args, options);
  if (args.includes("reset")) throw new Error("lost result");
  return result;
};`;
  expect(() => fixture.run(sandboxGitUndoCommand, { mode: "mixed" }, hook)).toThrow(expect.objectContaining({ code: "GIT_OUTCOME_UNKNOWN" }));
  expect(fixture.git("rev-parse", "HEAD")).toBe(fixture.headSha);
  expect(contents()).toBe("committed\n");
});
