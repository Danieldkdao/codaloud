import { createGitRoute } from "@/features/projects/server/git-route";
import {
  gitCreateBranchSchema,
  gitCreatedBranchSchema,
} from "@/features/projects/server/git-branch-schemas";
import { sandboxGitCreateBranchCommand } from "@/services/daytona/git-create-branch-command";

export const POST = createGitRoute({
  input: gitCreateBranchSchema,
  output: gitCreatedBranchSchema,
  script: sandboxGitCreateBranchCommand,
  mutation: true,
  message: "Branch created and checked out.",
});
