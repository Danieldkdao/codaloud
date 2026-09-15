import {
  createProjectCommitSchema,
  type CreateProjectCommitSchema,
} from "../actions/create-commit-schemas";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { readSandboxChanges } from "@/services/daytona/changes";
import { SandboxFilesError } from "@/services/daytona/api";
import { stageSandboxChanges } from "@/services/daytona/stage-changes";
import { commitSandboxChanges } from "@/services/daytona/commit-changes";

export const commitUserProject = async (
  headers: Headers,
  projectId: string,
  unsafeInput: CreateProjectCommitSchema,
  signal?: AbortSignal,
) => {
  const input = createProjectCommitSchema.safeParse(unsafeInput);
  if (!input.success) {
    throw new SandboxFilesError(
      400,
      "INVALID_COMMIT_INPUT",
      "Send a valid commit message and a nonempty list of unique repository-relative paths.",
    );
  }

  // Reuses session authentication, project ownership/readiness, sandbox labels,
  // and the bounded Git command rooted in this project's workspace. Local
  // branches belong to that repository; committing locally needs no GitHub token.
  const repository = await readSandboxChanges(headers, projectId, signal);
  const branch = projectBranchNameSchema.safeParse(repository.currentBranch);
  if (
    repository.repositoryState === "not-initialized" ||
    repository.isDetached ||
    !branch.success
  ) {
    throw new SandboxFilesError(
      409,
      "COMMIT_BRANCH_UNAVAILABLE",
      "Open an initialized repository with a checked-out branch before committing.",
    );
  }
  if (
    repository.changes.some(
      (change) =>
        change.isConflicted ||
        change.indexStatus === "unmerged" ||
        change.worktreeStatus === "unmerged",
    )
  ) {
    throw new SandboxFilesError(
      409,
      "COMMIT_UNRESOLVED_CONFLICTS",
      "Resolve the repository's conflicts before committing selected changes.",
    );
  }

  const changesByPath = new Map(
    repository.changes.map((change) => [change.path, change]),
  );
  const changes = input.data.paths.map((path) => {
    const change = changesByPath.get(path);
    if (
      !change ||
      (change.indexStatus === "unchanged" &&
        change.worktreeStatus === "unchanged")
    ) {
      throw new SandboxFilesError(
        409,
        "COMMIT_SELECTION_CHANGED",
        "A selected path is missing or no longer has changes. Refresh the changes and select the files again.",
      );
    }
    if (
      change.kind !== "file" ||
      change.staged?.unavailableReason === "unsupported" ||
      change.unstaged?.unavailableReason === "unsupported"
    ) {
      throw new SandboxFilesError(
        422,
        "COMMIT_UNSUPPORTED_FILE",
        "The selection contains a symbolic link, submodule, or unsupported file type. Select regular file changes.",
      );
    }
    // Git-reported deletions need no on-disk file. Renames retain originalPath
    // for later staging, but selection always uses the displayed current path.
    return change;
  });

  // A rename includes removal of its source; a copy leaves its source alone.
  const stagingPaths = [
    ...new Set(
      changes.flatMap((change) =>
        change.originalPath &&
        (change.indexStatus === "renamed" ||
          change.worktreeStatus === "renamed")
          ? [change.path, change.originalPath]
          : [change.path],
      ),
    ),
  ];
  const staged = await stageSandboxChanges(
    headers,
    projectId,
    {
      paths: stagingPaths,
      currentBranch: branch.data,
      headSha: repository.headSha,
    },
    signal,
  );

  return commitSandboxChanges(headers, projectId, staged, input.data.message, signal);
};
