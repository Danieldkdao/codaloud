import { chmodSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitCreateBranchCommand } from "../git-create-branch-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
it("creates from HEAD, checks out, and preserves dirty files", () => {
  fixture.write("file.txt", "unsaved work\n");
  const result = fixture.run(sandboxGitCreateBranchCommand, { branchName: "feature/new" });
  expect(result).toMatchObject({ previousBranch: "main", currentBranch: "feature/new", headSha: fixture.headSha });
  expect(fixture.git("diff")).toContain("unsaved work");
});
it("does not reset an existing branch", () => {
  fixture.git("branch", "existing");
  expect(() => fixture.run(sandboxGitCreateBranchCommand, { branchName: "existing" })).toThrow(expect.objectContaining({ code: "GIT_BRANCH_EXISTS" }));
  expect(fixture.git("branch", "--show-current")).toBe("main");
});
it("derives the source from the checked-out feature branch and current HEAD", () => {
  fixture.git("switch", "-c", "feature/source");
  fixture.git("commit", "--allow-empty", "-m", "Source tip");
  const tip = fixture.git("rev-parse", "HEAD");
  const result = fixture.run(sandboxGitCreateBranchCommand, { branchName: "feature/new" });
  expect(result).toEqual({ previousBranch: "feature/source", currentBranch: "feature/new", headSha: tip });
});
it.each(["detached", "unborn"])("rejects %s state without creating a branch", (state) => {
  if (state === "detached") fixture.git("switch", "--detach", "HEAD");
  else fixture.git("switch", "--orphan", "empty");
  expect(() => fixture.run(sandboxGitCreateBranchCommand, { branchName: "new" })).toThrow(expect.objectContaining({ code: "GIT_BRANCH_REQUIRED" }));
  expect(fixture.git("branch", "--list", "new")).toBe("");
});
it("does not run checkout hooks", () => {
  fixture.write(".git/hooks/post-checkout", "#!/bin/sh\ntouch hooked\n");
  chmodSync(join(fixture.repositoryPath, ".git/hooks/post-checkout"), 0o755);
  fixture.run(sandboxGitCreateBranchCommand, { branchName: "safe" });
  expect(fixture.git("status", "--porcelain")).toBe("");
});

it("captures state under the lock and rejects a branch change before mutation", () => {
  fixture.git("branch", "other");
  const hook = `
const cp = require("node:child_process");
const original = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  if (args.includes("symbolic-ref") && !require("node:fs").existsSync(${JSON.stringify(join(fixture.repositoryPath, ".git/codaloud-operation.lock"))})) throw new Error("State read outside lock");
  if (args.includes("check-ref-format")) original("git", ["switch", "other"], options);
  return original(file, args, options);
};`;
  expect(() => fixture.run(sandboxGitCreateBranchCommand, { branchName: "new" }, hook)).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
  expect(fixture.git("branch", "--list", "new")).toBe("");
});
