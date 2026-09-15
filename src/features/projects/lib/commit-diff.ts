import type { ProjectCommitDetailsSchema } from "../actions/commit-details-schemas";
import type { ProjectWorkspaceDiffData, ProjectWorkspaceDiffEntry } from "../types";
import { createProjectDiffComparison, getProjectDiffTotals } from "./workspace-diff";

export const createProjectCommitDiff = (
  details: ProjectCommitDetailsSchema,
): Pick<ProjectWorkspaceDiffData, "files" | "summary"> => {
  const files = details.files.map((file): ProjectWorkspaceDiffEntry => ({
    path: file.path,
    originalPath: file.originalPath,
    indexStatus: file.status,
    worktreeStatus: "unchanged",
    // The shared renderer has two comparison slots. A commit uses just one;
    // this describes its parent comparison, not the workspace's current index.
    staged: createProjectDiffComparison(file.diff, {
      key: JSON.stringify([details.commit.hash, file.path]),
      scope: "staged",
      beforePath: file.status === "added" ? null : file.originalPath ?? file.path,
      afterPath: file.status === "deleted" ? null : file.path,
      beforeMode: file.beforeMode,
      afterMode: file.afterMode,
    }),
    unstaged: null,
  }));
  return {
    files,
    summary: {
      fileCount: files.length,
      staged: getProjectDiffTotals(files, "staged"),
      unstaged: getProjectDiffTotals(files, "unstaged"),
    },
  };
};
