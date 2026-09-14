import type { ProjectRepositoryChangeSchema, ProjectRepositoryChangesSchema } from "../actions/change-schemas";
import type {
  ProjectDiffComparison,
  ProjectDiffScope,
  ProjectDiffTotals,
  ProjectWorkspaceDiffData,
  ProjectWorkspaceDiffEntry,
} from "../types";
import { parseProjectDiffPatch } from "./diff-patch";

const createProjectDiffComparison = (
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
    beforePath: beforeMode === "000000" ? null : scope === "staged" ? change.originalPath ?? change.path : change.path,
    afterPath: afterMode === "000000" ? null : change.path,
    beforeMode,
    afterMode,
  };
  if (diff.unavailableReason !== null) {
    return { ...comparison, kind: "unavailable", reason: diff.unavailableReason, additions: null, deletions: null };
  }
  const patch = parseProjectDiffPatch(diff.patch);
  if (!patch || patch.additions !== diff.additions || patch.deletions !== diff.deletions) {
    return { ...comparison, kind: "unavailable", reason: "invalid-patch", additions: null, deletions: null };
  }
  return { ...comparison, kind: "available", ...patch };
};

const getProjectDiffTotals = (files: ProjectWorkspaceDiffEntry[], scope: ProjectDiffScope): ProjectDiffTotals => {
  const total: ProjectDiffTotals = { fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 };
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
export const createProjectWorkspaceDiff = (data: ProjectRepositoryChangesSchema): ProjectWorkspaceDiffData => {
  const { changes, ...repository } = data;
  const files = changes.map((change): ProjectWorkspaceDiffEntry => ({
    ...change,
    staged: createProjectDiffComparison(change, "staged"),
    unstaged: createProjectDiffComparison(change, "unstaged"),
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
