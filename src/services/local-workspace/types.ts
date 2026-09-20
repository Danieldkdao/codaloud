import type {
  CheckoutProjectBranchSchema,
  ProjectBranchSource,
} from "@/features/projects/actions/branch-schemas";
import type { ProjectCommitDetailsParamsSchema } from "@/features/projects/actions/commit-details-schemas";
import type { CreateProjectCommitSchema } from "@/features/projects/actions/create-commit-schemas";
import type {
  CreateProjectFileSchema,
  UpdateProjectFileSchema,
  DeleteProjectFileSchema,
  SaveProjectFileContentSchema,
} from "@/features/projects/actions/file-schemas";
import type {
  GitCreateBranchSchema,
  GitDeleteBranchSchema,
} from "@/features/projects/server/git-branch-schemas";
import type { GitDiscardSchema } from "@/features/projects/server/git-discard-schemas";
import type { GitPullSchema } from "@/features/projects/server/git-pull-schemas";
import type { GitPushSchema } from "@/features/projects/server/git-push-schemas";
import type { GitRevertSchema } from "@/features/projects/server/git-revert-schemas";
import type {
  GitStashPushSchema,
  GitStashPopSchema,
  GitStashDropSchema,
} from "@/features/projects/server/git-stash-schemas";
import type { GitUndoSchema } from "@/features/projects/server/git-undo-schemas";
import type { GitIdentitySchema } from "@/features/settings/git-identity";
import type { GitPublishSchema } from "@/features/projects/actions/publish-schemas";

type WithIdentity = { identity: GitIdentitySchema };
type WithAccessToken = { accessToken: string };

// The C++ entry point receives JSON, so its signatures cannot describe individual
// commands. Keep this wire contract aligned with cpp/workspace.cpp and git-*.cpp.
export type WorkspaceArguments = {
  initialize: undefined;
  "archive-project": undefined;
  "restore-project": undefined;
  "purge-project": undefined;
  clone: { url: string } & WithAccessToken;
  "list-files": { path: string };
  "read-file": { path: string };
  "save-file": SaveProjectFileContentSchema;
  "create-file": CreateProjectFileSchema;
  "rename-file": UpdateProjectFileSchema;
  "delete-file": DeleteProjectFileSchema;
  "git/initialize": undefined;
  "git/counts": undefined;
  "git/changes": undefined;
  "git/branches": { source: ProjectBranchSource };
  "git/history": {
    branch: string;
    source: ProjectBranchSource;
    offset: number;
    limit: number;
    snapshotSha?: string;
  };
  "git/commit-details": Omit<ProjectCommitDetailsParamsSchema, "projectId">;
  "git/stashes": undefined;
  "git/discard-preview": undefined;
  "git/checkout": CheckoutProjectBranchSchema;
  "git/create-branch": GitCreateBranchSchema;
  "git/delete-branch": GitDeleteBranchSchema;
  "git/commit": CreateProjectCommitSchema & WithIdentity;
  "git/stash-save": GitStashPushSchema & WithIdentity;
  "git/stash-apply": GitStashPopSchema;
  "git/stash-drop": GitStashDropSchema;
  "git/discard": GitDiscardSchema;
  "git/undo": GitUndoSchema;
  "git/revert": GitRevertSchema & WithIdentity;
  "git/fetch": WithAccessToken;
  "git/push": GitPushSchema & WithAccessToken;
  "git/publish": GitPublishSchema & WithAccessToken;
  "git/pull": GitPullSchema & WithAccessToken & Partial<WithIdentity>;
};
export type WorkspaceOperation = keyof WorkspaceArguments;

// A discriminated tuple preserves the operation/payload relationship, including
// when a caller holds a union. A generic operation plus an independent union of
// payloads would accidentally accept mismatched commands.
export type WorkspaceCommand = {
  [
    Operation in WorkspaceOperation
  ]: WorkspaceArguments[Operation] extends undefined
    ? [operation: Operation]
    : [operation: Operation, args: WorkspaceArguments[Operation]];
}[WorkspaceOperation];
