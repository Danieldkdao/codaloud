import { createGitRoute } from "@/features/projects/server/git-route";
import { gitPushSchema, gitPushedSchema } from "@/features/projects/server/git-push-schemas";
import { sandboxGitPushCommand } from "@/services/daytona/git-push-command";

export const POST = createGitRoute({
  input: gitPushSchema, output: gitPushedSchema, script: sandboxGitPushCommand,
  mutation: true, remote: "write", message: "Branch pushed to GitHub.",
});
