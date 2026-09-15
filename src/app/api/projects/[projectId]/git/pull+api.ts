import { createGitRoute } from "@/features/projects/server/git-route";
import { gitPullSchema, gitPulledSchema } from "@/features/projects/server/git-pull-schemas";
import { sandboxGitPullCommand } from "@/services/daytona/git-pull-command";

export const POST = createGitRoute({
  input: gitPullSchema, output: gitPulledSchema, script: sandboxGitPullCommand,
  mutation: true, author: true, remote: "read", message: "Remote changes integrated.",
});
