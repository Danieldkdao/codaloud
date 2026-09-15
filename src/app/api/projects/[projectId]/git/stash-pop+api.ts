import { createGitRoute } from "@/features/projects/server/git-route";
import { gitStashPopSchema, gitStashPoppedSchema } from "@/features/projects/server/git-stash-schemas";
import { sandboxGitStashPopCommand } from "@/services/daytona/git-stash-pop-command";

export const POST = createGitRoute({
  input: gitStashPopSchema, output: gitStashPoppedSchema, script: sandboxGitStashPopCommand,
  mutation: true, message: "Stash applied and removed.",
});
