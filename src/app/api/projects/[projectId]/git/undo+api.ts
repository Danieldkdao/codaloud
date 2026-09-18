import { createGitRoute } from "@/features/projects/server/git-route";
import { gitUndoSchema, gitUndoneSchema } from "@/features/projects/server/git-undo-schemas";
import { sandboxGitUndoCommand } from "@/services/daytona/git-undo-command";

export const POST = createGitRoute({
  input: gitUndoSchema,
  output: gitUndoneSchema,
  script: sandboxGitUndoCommand,
  mutation: true,
  message: "Last commit undone on the current branch.",
});
