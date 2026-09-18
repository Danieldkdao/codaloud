import { createGitRoute } from "@/features/projects/server/git-route";
import {
  gitStashDropSchema,
  gitStashDroppedSchema,
} from "@/features/projects/server/git-stash-schemas";
import { sandboxGitStashDropCommand } from "@/services/daytona/git-stash-drop-command";

export const POST = createGitRoute({
  input: gitStashDropSchema,
  output: gitStashDroppedSchema,
  script: sandboxGitStashDropCommand,
  mutation: true,
  message: "Saved stash deleted.",
});
