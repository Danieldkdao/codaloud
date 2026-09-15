import { createGitRoute } from "@/features/projects/server/git-route";
import { gitStashQuerySchema, gitStashListSchema } from "@/features/projects/server/git-stash-schemas";
import { sandboxGitStashViewCommand } from "@/services/daytona/git-stash-view-command";

export const GET = createGitRoute({
  input: gitStashQuerySchema, output: gitStashListSchema, script: sandboxGitStashViewCommand,
  message: "Stash entries loaded.",
});
