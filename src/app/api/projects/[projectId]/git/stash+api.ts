import { createGitRoute } from "@/features/projects/server/git-route";
import {
  gitStashQuerySchema,
  gitStashListSchema,
} from "@/features/projects/server/git-stash-schemas";
import { sandboxGitStashListCommand } from "@/services/daytona/git-stash-list-command";
import {
  gitStashPushSchema,
  gitStashPushedSchema,
} from "@/features/projects/server/git-stash-schemas";
import { sandboxGitStashPushCommand } from "@/services/daytona/git-stash-push-command";

export const GET = createGitRoute({
  input: gitStashQuerySchema,
  output: gitStashListSchema,
  script: sandboxGitStashListCommand,
  message: "Stash entries loaded.",
});

export const POST = createGitRoute({
  input: gitStashPushSchema,
  output: gitStashPushedSchema,
  script: sandboxGitStashPushCommand,
  mutation: true,
  author: true,
  message: "Stash completed; ignored files were preserved.",
});
