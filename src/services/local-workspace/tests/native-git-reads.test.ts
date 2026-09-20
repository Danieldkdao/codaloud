import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { projectRepositoryChangesSchema } from "@/features/projects/actions/change-schemas";
import { projectCommitDetailsSchema } from "@/features/projects/actions/commit-details-schemas";
import { projectCommitSchema } from "@/features/projects/actions/commit-schemas";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-000000000001";
let root: string;
let directory: string;
const call = (operation: string, args: object = {}) => JSON.parse(execFileSync(executable, [root], {
  input: JSON.stringify({ projectId, operation, args: { ...args, identity: { name: "Developer", email: "dev@example.test" } } }), encoding: "utf8",
}));
const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
const commit = (content: string) => {
  writeFileSync(join(directory, "file.ts"), content);
  const result = call("git/commit", { paths: ["file.ts"], message: `Change ${content.trim()}` });
  expect(result.ok).toBe(true);
  return result.data.hash as string;
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-git-reads-"));
  directory = join(root, projectId);
  expect(call("initialize").ok).toBe(true);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it("reads untracked, staged, and unstaged changes with separate validated patches", () => {
  commit("one\n");
  writeFileSync(join(directory, "file.ts"), "two\n");
  git("add", "file.ts");
  writeFileSync(join(directory, "file.ts"), "three\n");
  writeFileSync(join(directory, "new.txt"), "new\n");
  const result = call("git/changes");
  expect(result.ok).toBe(true);
  const data = projectRepositoryChangesSchema.parse(result.data);
  const tracked = data.changes.find((change) => change.path === "file.ts")!;
  expect(tracked).toMatchObject({ indexStatus: "modified", worktreeStatus: "modified", headMode: "100644" });
  expect(tracked.staged?.patch).toContain("-one\n+two");
  expect(tracked.unstaged?.patch).toContain("-two\n+three");
  expect(data.changes.find((change) => change.path === "new.txt")).toMatchObject({ isUntracked: true, unstaged: { additions: 1 } });
});

it("marks binary changes unavailable without returning binary content", () => {
  writeFileSync(join(directory, "binary.bin"), Buffer.from([0, 255, 1]));
  const data = projectRepositoryChangesSchema.parse(call("git/changes").data);
  expect(data.changes[0].unstaged).toMatchObject({ patch: null, unavailableReason: "binary" });
});

it("reads stable history snapshots while newer commits arrive", () => {
  const first = commit("one\n");
  const second = commit("two\n");
  const page = call("git/history", { branch: "main", limit: 1 }).data;
  expect(page.commits.map((entry: unknown) => projectCommitSchema.parse(entry).hash)).toEqual([second]);
  commit("three\n");
  const next = call("git/history", { branch: "main", snapshotSha: page.snapshotSha, offset: page.nextOffset, limit: 1 }).data;
  expect(next.commits.map((entry: { hash: string }) => entry.hash)).toEqual([first]);
  expect(next.nextOffset).toBeNull();
});

it("reads root and later commit details with complete metadata and diff totals", () => {
  const first = commit("one\n");
  const second = commit("two\n");
  const rootCommit = projectCommitDetailsSchema.parse(call("git/commit-details", { commitSha: first }).data);
  expect(rootCommit).toMatchObject({ source: "local", baseSha: null, summary: { additions: 1, deletions: 0, fileCount: 1 } });
  const nextCommit = projectCommitDetailsSchema.parse(call("git/commit-details", { commitSha: second }).data);
  expect(nextCommit).toMatchObject({ baseSha: first, commit: { hash: second, author: "Developer" }, summary: { additions: 1, deletions: 1 } });
  expect(nextCommit.files[0].diff.patch).toContain("-one\n+two");
});

it("reports merge conflicts without pretending their patches are available", () => {
  commit("base\n");
  expect(call("git/create-branch", { branchName: "other" }).ok).toBe(true);
  commit("other\n");
  expect(call("git/checkout", { branchName: "main" }).ok).toBe(true);
  commit("main\n");
  expect(() => git("-c", "user.name=Developer", "-c", "user.email=dev@example.test", "merge", "--no-commit", "other")).toThrow();
  const result = call("git/changes");
  expect(result.ok).toBe(true);
  const changes = projectRepositoryChangesSchema.parse(result.data).changes;
  expect(changes[0]).toMatchObject({ isConflicted: true, staged: { unavailableReason: "conflict" }, unstaged: { unavailableReason: "conflict" } });
  expect(call("git/commit", { paths: ["file.ts"], message: "Unresolved" }).ok).toBe(false);
});
