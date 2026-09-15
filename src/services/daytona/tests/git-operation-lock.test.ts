import { afterEach, beforeEach, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sandboxStageChangesCommand } from "../stage-changes-command";
import { sandboxCommitChangesCommand } from "../commit-changes-command";
import { sandboxFetchBranchCommand } from "../fetch-branch-command";
import { sandboxGitCountsCommand } from "../git-counts-command";
import { sandboxGitLockRuntime } from "../git-lock-command";
import { sandboxCommandInput } from "../create-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
it.each([
  [sandboxStageChangesCommand, "COMMIT_STAGING_BUSY"],
  [sandboxCommitChangesCommand, "COMMIT_BUSY"],
  [sandboxFetchBranchCommand, "GIT_BUSY"],
  [sandboxGitCountsCommand, "GIT_BUSY"],
])("blocks an existing operation while another API owns the workspace lock", (script, code) => {
  fixture.write(".git/codaloud-operation.lock", "busy");
  expect(() => fixture.run(script)).toThrow(expect.objectContaining({ code }));
  expect(existsSync(join(fixture.repositoryPath, ".git/codaloud-operation.lock"))).toBe(true);
});
it("releases the lock after a callback failure", () => {
  const script = sandboxCommandInput + sandboxGitLockRuntime + `
try { withGitOperationLock(input.repositoryPath, () => { throw new Error("failure"); }); }
catch { process.stdout.write(JSON.stringify({ handled: true })); }
`;
  expect(fixture.run(script)).toEqual({ handled: true });
  expect(existsSync(join(fixture.repositoryPath, ".git/codaloud-operation.lock"))).toBe(false);
});
