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
it("rejects stale expected state", () => {
  expect(() => fixture.run(sandboxGitCreateBranchCommand, { branchName: "feature/new", expectedHeadSha: "a".repeat(40) })).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
  expect(fixture.git("branch", "--list", "feature/new")).toBe("");
});
it("does not run checkout hooks", () => {
  fixture.write(".git/hooks/post-checkout", "#!/bin/sh\ntouch hooked\n");
  chmodSync(join(fixture.repositoryPath, ".git/hooks/post-checkout"), 0o755);
  fixture.run(sandboxGitCreateBranchCommand, { branchName: "safe" });
  expect(fixture.git("status", "--porcelain")).toBe("");
});
