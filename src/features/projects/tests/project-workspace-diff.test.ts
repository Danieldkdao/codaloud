import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ProjectRepositoryChangeSchema,
  ProjectRepositoryChangesSchema,
} from "../actions/change-schemas";
import { parseProjectDiffPatch } from "../lib/diff-patch";
import { createProjectWorkspaceDiff } from "../lib/workspace-diff";

const replacement = "@@ -1 +1 @@\n-before\n+after\n";
const change = (
  overrides: Partial<ProjectRepositoryChangeSchema> = {},
): ProjectRepositoryChangeSchema => ({
  path: "src/example.ts",
  originalPath: null,
  indexStatus: "unchanged",
  worktreeStatus: "modified",
  isUntracked: false,
  isConflicted: false,
  kind: "file",
  headMode: "100644",
  indexMode: "100644",
  worktreeMode: "100644",
  staged: null,
  unstaged: { patch: replacement, additions: 1, deletions: 1, unavailableReason: null },
  ...overrides,
});
const snapshot = (
  changes: ProjectRepositoryChangeSchema[],
): ProjectRepositoryChangesSchema => ({
  repositoryState: "ready",
  currentBranch: "main",
  headSha: "a".repeat(40),
  isDetached: false,
  observedAt: "2026-09-13T12:00:00.000Z",
  changes,
});

describe("parseProjectDiffPatch", () => {
  it("separates Git headers from code and parses omitted hunk counts", () => {
    const metadata = [
      "diff --git a/src/example.ts b/src/example.ts",
      "index 1234567..abcdef0 100644",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
    ];
    const result = parseProjectDiffPatch(`${metadata.join("\n")}\n${replacement}`);
    expect(result).toEqual({
      metadata,
      additions: 1,
      deletions: 1,
      hunks: [{
        header: "@@ -1 +1 @@",
        oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
        beforeText: "before\n", afterText: "after\n",
        lines: [
          { kind: "deletion", text: "before", oldLine: 1, newLine: null, noNewline: false },
          { kind: "addition", text: "after", oldLine: null, newLine: 1, noNewline: false },
        ],
      }],
    });
  });

  it("keeps distant hunks separate instead of inventing missing file contents", () => {
    const patch = "@@ -2,2 +2,3 @@ export const example\n context\n-old\n+new\n+extra\n@@ -10 +11 @@\n-last\n+latest\n";
    const result = parseProjectDiffPatch(patch)!;
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(2);
    expect(result.hunks.map(({ beforeText, afterText }) => ({ beforeText, afterText }))).toEqual([
      { beforeText: "context\nold\n", afterText: "context\nnew\nextra\n" },
      { beforeText: "last\n", afterText: "latest\n" },
    ]);
    expect(result.hunks[1].lines.map(({ oldLine, newLine }) => [oldLine, newLine])).toEqual([[10, null], [null, 11]]);
  });

  it.each([
    ["@@ -0,0 +1,2 @@\n+one\n+two\n", "", "one\ntwo\n"],
    ["@@ -1,2 +0,0 @@\n-one\n-two\n", "one\ntwo\n", ""],
    ["@@ -3,0 +4 @@\n+inserted\n", "", "inserted\n"],
  ])("supports empty sides and insertion anchors: %s", (patch, beforeText, afterText) => {
    expect(parseProjectDiffPatch(patch)?.hunks[0]).toMatchObject({ beforeText, afterText });
  });

  it("preserves Unicode, tabs, trailing spaces, empty source lines and CRLF bytes", () => {
    const result = parseProjectDiffPatch("@@ -1,2 +1,2 @@\n-\told 🦊  \r\n+\tnew 🦊  \r\n \r\n")!;
    expect(result.hunks[0]).toMatchObject({ beforeText: "\told 🦊  \r\n\r\n", afterText: "\tnew 🦊  \r\n\r\n" });
    expect(result.hunks[0].lines[2]).toMatchObject({ kind: "context", text: "\r", oldLine: 2, newLine: 2 });
    expect(parseProjectDiffPatch("@@ -1 +1 @@\n-\n+x\n")?.hunks[0].beforeText).toBe("\n");
  });

  it.each([
    ["@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n", "old", "new\n"],
    ["@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n", "old\n", "new"],
    ["@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n", "old", "new"],
    ["@@ -1,2 +1,2 @@\n-old\n+new\n last\n\\ No newline at end of file\n", "old\nlast", "new\nlast"],
  ])("preserves each side's missing final newline: %s", (patch, beforeText, afterText) => {
    const hunk = parseProjectDiffPatch(patch)!.hunks[0];
    expect(hunk).toMatchObject({ beforeText, afterText });
    expect(hunk.lines.some((line) => line.noNewline)).toBe(true);
  });

  it("treats header-like source inside a hunk as code", () => {
    const result = parseProjectDiffPatch("@@ -1,2 +1,2 @@\n---old\n-@@ old\n+++new\n+@@ new\n")!;
    expect(result.hunks[0]).toMatchObject({ beforeText: "--old\n@@ old\n", afterText: "++new\n@@ new\n" });
    expect(result).toMatchObject({ additions: 2, deletions: 2 });
  });

  it.each([
    "",
    "diff --git a/file b/file\nold mode 100644\nnew mode 100755\n",
    "diff --git a/file b/file\nnew file mode 100644\nindex 0000000..e69de29\n",
    "diff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new\n",
  ])("keeps valid metadata-only comparisons: %s", (patch) => {
    expect(parseProjectDiffPatch(patch)).toMatchObject({ hunks: [], additions: 0, deletions: 0 });
  });

  it.each([
    "not a patch\n",
    "@@@ -1,1 -1,1 +1,1 @@@\n-text\n",
    "@@ -1,2 +1 @@\n-old\n+new\n", // Missing old line.
    "@@ -1 +1 @@\n-old\n+new\n+extra\n", // Extra new line.
    "@@ -0 +1 @@\n-old\n+new\n", // Nonempty side cannot start at zero.
    "@@ -0,0 +0,0 @@\n",
    "@@ -9007199254740992 +9007199254740992 @@\n-a\n+b\n",
    "@@ -1 +1 @@\n-old\n+new", // The patch transport itself is truncated.
    "@@ -1 +1 @@\n-old\n+new\n@@ -1 +1 @@\n-a\n+b\n", // Overlap.
    "@@ -1 +1 @@\n-old\n+new\n@@ -4 +5 @@\n-a\n+b\n", // Unequal omitted context.
    "@@ -1 +1 @@\n-old\n+new\n\n", // Unprefixed body line.
    "@@ -1 +1 @@\n\\ No newline at end of file\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n\\ No newline at end of file\n",
    "@@ -1,2 +1 @@\n-old\n\\ No newline at end of file\n-more\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n@@ -3 +3 @@\n-a\n+b\n",
    "diff --git a/one b/one\nold mode 100644\nnew mode 100755\ndiff --git a/two b/two\n",
    "diff --git a/one b/one\nBinary files a/one and b/one differ\n",
    "@@ -1 +1 @@\n-a\n+\0\n",
  ])("rejects malformed, unsupported or incomplete patches: %s", (patch) => {
    expect(parseProjectDiffPatch(patch)).toBeNull();
  });

  it("reads real Git patches and reproduces the exact source excerpts", () => {
    const directory = mkdtempSync(join(tmpdir(), "codaloud-diff-parser-"));
    const unchanged = Array.from({ length: 25 }, (_, index) => `unchanged ${index}\n`).join("");
    const fixtures = [
      ["before\n", "after\n"],
      ["", "new\n"],
      ["removed", ""],
      ["before", "after\n"],
      ["before\n", "after"],
      ["const before = 1;\r\n", "const after = 2;\r\n"],
      [`old\n${unchanged}end`, `new\nextra\n${unchanged}last`],
    ];
    const sourceLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    try {
      for (const [before, after] of fixtures) {
        writeFileSync(join(directory, "before"), before);
        writeFileSync(join(directory, "after"), after);
        const command = spawnSync("git", [
          "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", "--", "before", "after",
        ], { cwd: directory, encoding: "utf8", timeout: 5000 });
        expect(command.status, command.stderr).toBe(1);
        const parsed = parseProjectDiffPatch(command.stdout);
        expect(parsed, command.stdout).not.toBeNull();
        for (const hunk of parsed!.hunks) {
          expect(hunk.beforeText).toBe(hunk.oldCount === 0 ? "" : sourceLines(before).slice(hunk.oldStart - 1, hunk.oldStart - 1 + hunk.oldCount).join(""));
          expect(hunk.afterText).toBe(hunk.newCount === 0 ? "" : sourceLines(after).slice(hunk.newStart - 1, hunk.newStart - 1 + hunk.newCount).join(""));
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("createProjectWorkspaceDiff", () => {
  it("keeps staged and unstaged comparisons separate even when they cancel", () => {
    const source = snapshot([change({
      indexStatus: "modified",
      staged: { patch: replacement, additions: 1, deletions: 1, unavailableReason: null },
      unstaged: { patch: "@@ -1 +1 @@\n-after\n+before\n", additions: 1, deletions: 1, unavailableReason: null },
    })]);
    const original = structuredClone(source);
    const result = createProjectWorkspaceDiff(source);
    expect(source).toEqual(original);
    expect(result).toMatchObject({
      currentBranch: "main", headSha: source.headSha, observedAt: source.observedAt,
      summary: {
        fileCount: 1,
        staged: { fileCount: 1, additions: 1, deletions: 1, unavailableCount: 0 },
        unstaged: { fileCount: 1, additions: 1, deletions: 1, unavailableCount: 0 },
      },
    });
    const file = result.files[0];
    expect(file.staged).toMatchObject({ kind: "available", scope: "staged", beforePath: source.changes[0].path, afterPath: source.changes[0].path });
    expect(file.unstaged).toMatchObject({ kind: "available", scope: "unstaged" });
    expect(file.staged?.key).not.toBe(file.unstaged?.key);
    if (file.staged?.kind !== "available" || file.unstaged?.kind !== "available") throw new Error("Expected patches");
    expect(file.staged.hunks[0].afterText).toBe("after\n");
    expect(file.unstaged.hunks[0].afterText).toBe("before\n");
  });

  it("uses exact backend rename paths and modes rather than patch headers", () => {
    const path = "src/new [name]\n🦊.ts";
    const originalPath = "src/old\\name.ts";
    const result = createProjectWorkspaceDiff(snapshot([change({
      path, originalPath, indexStatus: "renamed", indexMode: "100755", worktreeMode: "100755",
      staged: { patch: replacement, additions: 1, deletions: 1, unavailableReason: null },
    })]));
    expect(result.files[0]).toMatchObject({ path, originalPath, indexStatus: "renamed" });
    expect(result.files[0].staged).toMatchObject({ beforePath: originalPath, afterPath: path, beforeMode: "100644", afterMode: "100755" });
    expect(result.files[0].unstaged).toMatchObject({ beforePath: path, afterPath: path, beforeMode: "100755", afterMode: "100755" });
  });

  it("represents new, deleted and empty files without dropping their metadata", () => {
    const result = createProjectWorkspaceDiff(snapshot([
      change({ path: "new.ts", isUntracked: true, worktreeStatus: "untracked", headMode: "000000", indexMode: "000000", unstaged: { patch: "@@ -0,0 +1 @@\n+new\n", additions: 1, deletions: 0, unavailableReason: null } }),
      change({ path: "deleted.ts", worktreeStatus: "deleted", worktreeMode: "000000", unstaged: { patch: "@@ -1 +0,0 @@\n-old\n", additions: 0, deletions: 1, unavailableReason: null } }),
      change({ path: "empty.ts", isUntracked: true, worktreeStatus: "untracked", headMode: "000000", indexMode: "000000", unstaged: { patch: "", additions: 0, deletions: 0, unavailableReason: null } }),
    ]));
    expect(result.files[0].unstaged).toMatchObject({ beforePath: null, afterPath: "new.ts" });
    expect(result.files[1].unstaged).toMatchObject({ beforePath: "deleted.ts", afterPath: null });
    expect(result.files[2].unstaged).toMatchObject({ kind: "available", hunks: [], additions: 0, deletions: 0 });
    expect(result.summary.unstaged).toEqual({ fileCount: 3, additions: 1, deletions: 1, unavailableCount: 0 });
    expect(result.files.every((file) => file.staged === null)).toBe(true);
  });

  it("keeps unavailable previews distinct from absent scopes and zero counts", () => {
    const reasons = ["binary", "too-large", "unsupported", "conflict"] as const;
    const result = createProjectWorkspaceDiff(snapshot(reasons.map((reason) => change({
      path: `${reason}.txt`, isConflicted: reason === "conflict",
      kind: reason === "unsupported" ? "symlink" : "file",
      unstaged: { patch: null, additions: null, deletions: null, unavailableReason: reason },
    }))));
    expect(result.files.map((file) => file.unstaged)).toEqual(reasons.map((reason) => expect.objectContaining({ kind: "unavailable", reason, additions: null, deletions: null })));
    expect(result.summary.unstaged).toEqual({ fileCount: 4, additions: 0, deletions: 0, unavailableCount: 4 });
    expect(result.summary.staged).toEqual({ fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 });
  });

  it("isolates invalid patches and mismatched server counts to the affected scope", () => {
    const result = createProjectWorkspaceDiff(snapshot([
      change(),
      change({ path: "broken.ts", unstaged: { patch: "bad patch", additions: 1, deletions: 1, unavailableReason: null } }),
      change({ path: "wrong-count.ts", unstaged: { patch: replacement, additions: 4, deletions: 1, unavailableReason: null } }),
    ]));
    expect(result.files[0].unstaged?.kind).toBe("available");
    expect(result.files.slice(1).map((file) => file.unstaged)).toEqual([
      expect.objectContaining({ kind: "unavailable", reason: "invalid-patch" }),
      expect.objectContaining({ kind: "unavailable", reason: "invalid-patch" }),
    ]);
    expect(result.summary.unstaged).toEqual({ fileCount: 3, additions: 1, deletions: 1, unavailableCount: 2 });
  });

  it.each(["ready", "unborn", "not-initialized"] as const)("preserves empty %s repository observations", (repositoryState) => {
    const result = createProjectWorkspaceDiff({ ...snapshot([]), repositoryState, currentBranch: null, headSha: null });
    expect(result).toMatchObject({ repositoryState, currentBranch: null, headSha: null, files: [], summary: { fileCount: 0 } });
  });

  it("preserves detached checkout metadata and returns serializable data", () => {
    const result = createProjectWorkspaceDiff({ ...snapshot([change()]), currentBranch: null, isDetached: true });
    expect(result.isDetached).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
