import type { WorkspaceArguments, WorkspaceOperation } from "@/services/local-workspace/types";
import type { ProjectBranchParamsSchema } from "../lib/branch-params";
import type { ProjectCommitParamsSchema } from "../lib/commit-params";
import type { GitStashQuerySchema } from "../server/git-stash-schemas";

type NativeGitOperation = Exclude<Extract<WorkspaceOperation, `git/${string}`>, "git/branches" | "git/history" | "git/stashes">;
type ProjectGitArguments<Operation extends NativeGitOperation> = WorkspaceArguments[Operation] extends undefined
  ? Record<string, never>
  : Omit<WorkspaceArguments[Operation], "identity" | "accessToken">;

// Project dispatch supplies credentials and identity; callers cannot substitute them.
export type ProjectGitCommand = {
  [Operation in NativeGitOperation]: WorkspaceArguments[Operation] extends undefined
    ? { operation: Operation; args?: never }
    : keyof ProjectGitArguments<Operation> extends never
    ? { operation: Operation; args?: never }
    : { operation: Operation; args: ProjectGitArguments<Operation> };
}[NativeGitOperation]
  | { operation: "branches"; args: ProjectBranchParamsSchema }
  | { operation: "history"; args: ProjectCommitParamsSchema }
  | { operation: "stashes"; args: GitStashQuerySchema };
