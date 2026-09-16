import type { ProjectGitReadFailureHandler } from "../types";
import { gitUndoSchema, gitUndoneSchema } from "../server/git-undo-schemas";
import { gitRevertSchema } from "../server/git-revert-schemas";
import { projectCreatedCommitSchema } from "./create-commit-schemas";
import {
  gitDiscardPreviewSchema,
  gitDiscardSchema,
  gitDiscardedSchema,
} from "../server/git-discard-schemas";
import {
  gitStashQuerySchema,
  gitStashListSchema,
  gitStashPushSchema,
  gitStashPushedSchema,
  gitStashPopSchema,
  gitStashPoppedSchema,
} from "../server/git-stash-schemas";
import {
  gitCreateBranchSchema,
  gitCreatedBranchSchema,
} from "../server/git-branch-schemas";
import { gitPullSchema, gitPulledSchema } from "../server/git-pull-schemas";
import { gitPushSchema, gitPushedSchema } from "../server/git-push-schemas";
import { z } from "zod";
import {
  mutateProjectGitRequest,
  readProjectGitRequest,
} from "../lib/git-requests";
import { gitCountsSchema } from "../server/git-schemas";
import {
  projectBranchCheckoutSchema,
  checkoutProjectBranchSchema,
  readProjectBranchesResponseSchema,
  type CheckoutProjectBranchResponseSchema,
  type CheckoutProjectBranchSchema,
  type ProjectBranchPageSchema,
} from "./branch-schemas";
import {
  projectBranchParamsSchema,
  readProjectBranchCursor,
  type ProjectBranchParamsSchema,
} from "../lib/branch-params";
import {
  readProjectChangesResponseSchema,
  type ProjectRepositoryChangesSchema,
} from "./change-schemas";
import {
  readProjectCommitsResponseSchema,
  type CommitSource,
  type ProjectCommitPageSchema,
  type ProjectCommitQueryInput,
} from "./commit-schemas";
import { projectCommitParamsSchema } from "../lib/commit-params";
import {
  projectCommitDetailsParamsSchema,
  readProjectCommitDetailsResponseSchema,
  type ProjectCommitDetailsParamsSchema,
  type ProjectCommitDetailsSchema,
} from "./commit-details-schemas";
import {
  createProjectCommitSchema,
  type CreateProjectCommitResponseSchema,
  type CreateProjectCommitSchema,
} from "./create-commit-schemas";

export const readProjectGitCountsAction = async (
  projectId: string,
  signal?: AbortSignal,
  onFailure?: ProjectGitReadFailureHandler,
) =>
  readProjectGitRequest({
    projectId,
    path: "git/counts",
    input: z.strictObject({}),
    output: gitCountsSchema,
    signal,
    onFailure,
  });

export const fetchProjectGitAction = async (projectId: string) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/fetch",
    input: z.strictObject({}),
    unsafeInput: {},
    output: gitCountsSchema,
  });

export const createProjectCommitAction = async (
  projectId: string,
  unsafeInput: CreateProjectCommitSchema,
): Promise<CreateProjectCommitResponseSchema> =>
  mutateProjectGitRequest({
    projectId,
    path: "commits",
    input: createProjectCommitSchema,
    unsafeInput,
    output: projectCreatedCommitSchema,
    errors: {
      unauthenticated: {
        error: true,
        code: "UNAUTHENTICATED",
        message: "Sign in to commit changes.",
      },
      input: {
        error: true,
        code: "INVALID_COMMIT_INPUT",
        message:
          "Send a nonempty commit message and a nonempty list of unique repository-relative paths, without extra fields.",
      },
      preparation: {
        error: true,
        code: "COMMIT_REQUEST_UNAVAILABLE",
        message: "Unable to prepare the commit request. Please try again.",
      },
      unknownOutcome: {
        error: true,
        code: "COMMIT_OUTCOME_UNKNOWN",
        message:
          "Unable to confirm the commit. Refresh commit history and Git changes before retrying; the commit may already exist.",
      },
    },
  });

export const checkoutProjectBranchAction = async (
  projectId: string,
  unsafeInput: CheckoutProjectBranchSchema,
): Promise<CheckoutProjectBranchResponseSchema> => {
  const unconfirmed = {
    error: true as const,
    code: "CHECKOUT_OUTCOME_UNKNOWN",
    message:
      "Unable to confirm the branch switch. Refresh the current branch and files before trying again.",
  };
  return mutateProjectGitRequest({
    projectId,
    path: "checkout",
    input: checkoutProjectBranchSchema,
    unsafeInput,
    output: projectBranchCheckoutSchema,
    validate: (data, input) => data.currentBranch === input.branchName,
    errors: {
      session: {
        error: true,
        message: "Unable to verify your session. Please try again.",
      },
      unauthenticated: { error: true, message: "Sign in to switch branches." },
      project: { error: true, message: "Invalid project ID." },
      input: {
        error: true,
        message:
          "Send a valid branchName without checkout options or extra fields.",
      },
      preparation: unconfirmed,
      unknownOutcome: unconfirmed,
    },
  });
};

export const readProjectChangesAction = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectRepositoryChangesSchema | null> =>
  readProjectGitRequest({
    projectId,
    path: "changes",
    input: z.strictObject({}),
    output: readProjectChangesResponseSchema.shape.data,
    signal,
  });

export const readProjectBranchesAction = async (
  projectId: string,
  params: Partial<Omit<ProjectBranchParamsSchema, "projectId">> = {},
  signal?: AbortSignal,
  onFailure?: ProjectGitReadFailureHandler,
): Promise<ProjectBranchPageSchema | null> =>
  readProjectGitRequest({
    projectId,
    path: "branches",
    input: projectBranchParamsSchema,
    params: { ...params, projectId },
    query: ({ search, cursor, pageSize }) => ({ search, cursor, pageSize }),
    output: readProjectBranchesResponseSchema.shape.data,
    signal,
    onFailure: onFailure
      ? (status, retryAfter, code) => {
          // Branch queries only use the restoration code to customize retries.
          if (status === 0) onFailure(status, retryAfter);
          else
            onFailure(
              status,
              retryAfter,
              code === "WORKSPACE_RESTORING" ? code : undefined,
            );
        }
      : undefined,
    validate: (page, { search, cursor, pageSize }) => {
      const position = cursor ? readProjectBranchCursor(cursor) : null;
      if (
        page.branches.length > pageSize ||
        page.branches.some(
          (branch, index) =>
            !branch.toLowerCase().includes(search) ||
            (position !== null && branch <= position.after) ||
            (index > 0 && branch <= page.branches[index - 1]),
        )
      )
        return false;
      if (page.nextCursor !== null) {
        const next = readProjectBranchCursor(page.nextCursor);
        if (
          !next ||
          next.projectId !== projectId ||
          next.search !== search ||
          next.after !== page.branches[page.branches.length - 1]
        )
          return false;
      }
      return true;
    },
  });

export const readProjectCommitDetailsAction = async (
  projectId: string,
  params: Omit<ProjectCommitDetailsParamsSchema, "projectId">,
  signal?: AbortSignal,
): Promise<ProjectCommitDetailsSchema | null> =>
  readProjectGitRequest({
    projectId,
    path: ({ commitSha }) => `commit/${commitSha}`,
    input: projectCommitDetailsParamsSchema,
    params: { ...params, projectId },
    query: ({ source }) => ({ source }),
    output: readProjectCommitDetailsResponseSchema.shape.data,
    signal,
    validate: (data, { commitSha, source }) =>
      data.commit.hash === commitSha && data.source === source,
  });

export const readProjectCommitsAction = async (
  projectId: string,
  params: ProjectCommitQueryInput & { source: CommitSource },
  signal?: AbortSignal,
  onFailure?: ProjectGitReadFailureHandler,
): Promise<ProjectCommitPageSchema | null> =>
  readProjectGitRequest({
    projectId,
    path: "commits",
    input: projectCommitParamsSchema,
    params: { ...params, projectId },
    query: ({ projectId: _projectId, ...queryParams }) => queryParams,
    output: readProjectCommitsResponseSchema.shape.data,
    signal,
    onFailure,
    validate: (page, { pageSize, cursor }) => {
      if (
        page.commits.length > pageSize ||
        (page.nextCursor !== null &&
          (!page.nextCursor || page.nextCursor === cursor)) ||
        (page.snapshotSha === null &&
          (page.commits.length > 0 || page.nextCursor !== null))
      )
        return false;
      // Bounded searches can return no matches yet still have more history to scan.
      return true;
    },
  });

export const pushProjectGitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitPushSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/push",
    output: gitPushedSchema,
    input: gitPushSchema,
    unsafeInput,
  });

export const pullProjectGitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitPullSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/pull",
    output: gitPulledSchema,
    input: gitPullSchema,
    unsafeInput,
  });

export const createProjectBranchAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitCreateBranchSchema>,
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/branches",
    output: gitCreatedBranchSchema,
    input: gitCreateBranchSchema,
    unsafeInput,
  });

export const readProjectStashesAction = async (
  projectId: string,
  params: z.input<typeof gitStashQuerySchema> = {},
  signal?: AbortSignal,
) =>
  readProjectGitRequest({
    projectId,
    path: "git/stash",
    output: gitStashListSchema,
    input: gitStashQuerySchema,
    params,
    signal,
  });

export const stashProjectChangesAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitStashPushSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/stash",
    output: gitStashPushedSchema,
    input: gitStashPushSchema,
    unsafeInput,
  });

export const popProjectStashAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitStashPopSchema>,
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/stash-pop",
    output: gitStashPoppedSchema,
    input: gitStashPopSchema,
    unsafeInput,
  });

export const readProjectDiscardPreviewAction = async (
  projectId: string,
  signal?: AbortSignal,
) =>
  readProjectGitRequest({
    projectId,
    path: "git/discard",
    input: z.strictObject({}),
    output: gitDiscardPreviewSchema,
    signal,
  });

export const discardProjectChangesAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitDiscardSchema>,
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/discard",
    output: gitDiscardedSchema,
    input: gitDiscardSchema,
    unsafeInput,
  });

export const revertProjectCommitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitRevertSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/revert",
    output: projectCreatedCommitSchema,
    input: gitRevertSchema,
    unsafeInput,
  });

export const undoProjectCommitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitUndoSchema>,
) =>
  mutateProjectGitRequest({
    projectId,
    path: "git/undo",
    output: gitUndoneSchema,
    input: gitUndoSchema,
    unsafeInput,
  });
