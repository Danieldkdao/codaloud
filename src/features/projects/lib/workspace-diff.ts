import type {
  ProjectChangeDiffSchema,
  ProjectRepositoryChangeSchema,
  ProjectRepositoryChangesSchema,
} from "../actions/change-schemas";
import type {
  ProjectDiffComparison,
  ProjectDiffScope,
  ProjectDiffTotals,
  ProjectWorkspaceDiffData,
  ProjectWorkspaceDiffEntry,
  ProjectWorkspaceDiffRow,
} from "../types";
import { parseProjectDiffPatch } from "./diff-patch";

const createProjectWorkspaceComparison = (
  change: ProjectRepositoryChangeSchema,
  scope: ProjectDiffScope,
): ProjectDiffComparison | null => {
  const diff = change[scope];
  if (diff === null) return null;
  const beforeMode = scope === "staged" ? change.headMode : change.indexMode;
  const afterMode = scope === "staged" ? change.indexMode : change.worktreeMode;
  const comparison = {
    key: JSON.stringify([change.path, scope]),
    scope,
    beforePath:
      beforeMode === "000000"
        ? null
        : scope === "staged"
          ? (change.originalPath ?? change.path)
          : change.path,
    afterPath: afterMode === "000000" ? null : change.path,
    beforeMode,
    afterMode,
  };
  return createProjectDiffComparison(diff, comparison);
};

export const createProjectDiffComparison = (
  diff: ProjectChangeDiffSchema,
  comparison: Pick<
    ProjectDiffComparison,
    "key" | "scope" | "beforePath" | "afterPath" | "beforeMode" | "afterMode"
  >,
): ProjectDiffComparison => {
  if (diff.unavailableReason !== null) {
    return {
      ...comparison,
      kind: "unavailable",
      reason: diff.unavailableReason,
      additions: null,
      deletions: null,
    };
  }
  const patch = parseProjectDiffPatch(diff.patch);
  if (
    !patch ||
    patch.additions !== diff.additions ||
    patch.deletions !== diff.deletions
  ) {
    return {
      ...comparison,
      kind: "unavailable",
      reason: "invalid-patch",
      additions: null,
      deletions: null,
    };
  }
  return { ...comparison, kind: "available", ...patch };
};

export const getProjectDiffTotals = (
  files: ProjectWorkspaceDiffEntry[],
  scope: ProjectDiffScope,
): ProjectDiffTotals => {
  const total: ProjectDiffTotals = {
    fileCount: 0,
    additions: 0,
    deletions: 0,
    unavailableCount: 0,
  };
  for (const file of files) {
    const comparison = file[scope];
    if (comparison === null) continue;
    total.fileCount++;
    if (comparison.kind === "unavailable") {
      total.unavailableCount++;
    } else {
      total.additions += comparison.additions;
      total.deletions += comparison.deletions;
    }
  }
  return total;
};

/** Consumes the already-validated data from readProjectChangesAction/useProjectChanges. */
export const createProjectWorkspaceDiff = (
  data: ProjectRepositoryChangesSchema,
): ProjectWorkspaceDiffData => {
  const { changes, ...repository } = data;
  const files = changes.map((change): ProjectWorkspaceDiffEntry => ({
    ...change,
    staged: createProjectWorkspaceComparison(change, "staged"),
    unstaged: createProjectWorkspaceComparison(change, "unstaged"),
  }));
  return {
    ...repository,
    files,
    summary: {
      fileCount: files.length,
      staged: getProjectDiffTotals(files, "staged"),
      unstaged: getProjectDiffTotals(files, "unstaged"),
    },
  };
};

export const createProjectWorkspaceDiffRows = (
  files: ProjectWorkspaceDiffEntry[],
  collapsedPaths: ReadonlySet<string>,
): ProjectWorkspaceDiffRow[] => {
  const rows: ProjectWorkspaceDiffRow[] = [];
  for (const file of files) {
    rows.push({
      kind: "file",
      key: JSON.stringify([file.path, "file"]),
      path: file.path,
      file,
    });
    if (collapsedPaths.has(file.path)) continue;
    for (const comparison of [file.staged, file.unstaged]) {
      if (!comparison) continue;
      rows.push({
        kind: "comparison",
        key: comparison.key,
        path: file.path,
        comparison,
        status:
          comparison.scope === "staged"
            ? file.indexStatus
            : file.worktreeStatus,
      });
      if (comparison.kind !== "available") continue;
      for (const hunk of comparison.hunks) {
        rows.push({
          kind: "hunk",
          path: file.path,
          hunk,
          key: JSON.stringify([
            file.path,
            comparison.scope,
            hunk.oldStart,
            hunk.newStart,
            "hunk",
          ]),
        });
        for (const [index, line] of hunk.lines.entries()) {
          rows.push({
            kind: "line",
            path: file.path,
            line,
            key: JSON.stringify([
              file.path,
              comparison.scope,
              hunk.oldStart,
              hunk.newStart,
              index,
            ]),
          });
        }
      }
    }
  }
  return rows;
};
