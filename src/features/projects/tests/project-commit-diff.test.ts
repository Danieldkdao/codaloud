import { expect, it } from "vitest";
import type { ProjectCommitDetailsSchema, ProjectCommitFileSchema } from "../actions/commit-details-schemas";
import { createProjectCommitDiff } from "../lib/commit-diff";
import { createProjectWorkspaceDiffRows } from "../lib/workspace-diff";

const file: ProjectCommitFileSchema = {
  path: "src/live.ts", originalPath: null, status: "modified", beforeMode: "100644", afterMode: "100644",
  diff: { patch: "@@ -1 +1 @@\n-before\n+after\n", additions: 1, deletions: 1, unavailableReason: null },
};
const details = (files: ProjectCommitFileSchema[]): ProjectCommitDetailsSchema => ({
  source: "local", commit: { hash: "a".repeat(40), message: "Live commit", author: "Ada", authorEmail: "ada@example.com",
    committer: "Ada", committerEmail: "ada@example.com", authoredAt: "2026-09-15T12:00:00Z",
    committedAt: "2026-09-15T12:00:00Z", parentHashes: [], isMerge: false },
  baseSha: null, files, githubUrl: null,
  summary: { fileCount: files.length, additions: 1, deletions: 1, unavailableCount: 0 },
});

it("adapts real commit patches into the existing virtualized diff rows", () => {
  const diff = createProjectCommitDiff(details([file]));
  const rows = createProjectWorkspaceDiffRows(diff.files, new Set());
  expect(rows.map(row => row.kind)).toEqual(["file", "comparison", "line", "line"]);
  expect(rows[2]).toMatchObject({ path: file.path, line: { kind: "deletion", text: "before" } });
  expect(rows[3]).toMatchObject({ path: file.path, line: { kind: "addition", text: "after" } });
  expect(diff.summary.staged).toEqual({ fileCount: 1, additions: 1, deletions: 1, unavailableCount: 0 });
});

it.each(["renamed", "copied"] as const)("preserves %s paths and unknown remote modes", (status) => {
  const diff = createProjectCommitDiff(details([{ ...file, status, originalPath: "src/old.ts", beforeMode: null, afterMode: null }]));
  expect(diff.files[0]).toMatchObject({ originalPath: "src/old.ts", indexStatus: status,
    staged: { beforePath: "src/old.ts", afterPath: file.path, beforeMode: null, afterMode: null } });
});

it.each(["added", "deleted"] as const)("uses the %s status to identify an absent side even without modes", (status) => {
  const diff = createProjectCommitDiff(details([{ ...file, status, beforeMode: null, afterMode: null }]));
  expect(diff.files[0].staged).toMatchObject({
    beforePath: status === "added" ? null : file.path,
    afterPath: status === "deleted" ? null : file.path,
  });
});

it("keeps unavailable files and isolates malformed patches without inventing line totals", () => {
  const diff = createProjectCommitDiff(details([
    { ...file, diff: { patch: null, additions: null, deletions: null, unavailableReason: "binary" } },
    { ...file, path: "bad.ts", diff: { patch: "invalid", additions: 1, deletions: 1, unavailableReason: null } },
  ]));
  expect(diff.files[0].staged).toMatchObject({ kind: "unavailable", reason: "binary" });
  expect(diff.files[1].staged).toMatchObject({ kind: "unavailable", reason: "invalid-patch" });
  expect(diff.summary.staged).toEqual({ fileCount: 2, additions: 0, deletions: 0, unavailableCount: 2 });
});

it("preserves empty commits", () => {
  const diff = createProjectCommitDiff(details([]));
  expect(diff.files).toEqual([]);
  expect(diff.summary.fileCount).toBe(0);
  expect(diff.summary.staged).toEqual({ fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 });
});
