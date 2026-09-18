import { createGitRoute } from "@/features/projects/server/git-route";
import { gitRevertSchema } from "@/features/projects/server/git-revert-schemas";
import { projectCreatedCommitSchema } from "@/features/projects/actions/create-commit-schemas";
import { sandboxGitRevertCommand } from "@/services/daytona/git-revert-command";

export const POST = createGitRoute({
  input: gitRevertSchema,
  output: projectCreatedCommitSchema,
  script: sandboxGitRevertCommand,
  mutation: true,
  author: true,
  message: "Last commit reverted with a new commit.",
});
