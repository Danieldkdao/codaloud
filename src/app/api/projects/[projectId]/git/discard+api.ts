import { z } from "zod";
import { createGitRoute } from "@/features/projects/server/git-route";
import { gitDiscardSchema, gitDiscardedSchema, gitDiscardPreviewSchema } from "@/features/projects/server/git-discard-schemas";
import { sandboxGitDiscardCommand, sandboxGitDiscardPreviewCommand } from "@/services/daytona/git-discard-command";

export const GET = createGitRoute({
  input: z.strictObject({}), output: gitDiscardPreviewSchema, script: sandboxGitDiscardPreviewCommand,
  message: "Review these changes before confirming discard.",
});
export const POST = createGitRoute({
  input: gitDiscardSchema, output: gitDiscardedSchema, script: sandboxGitDiscardCommand,
  mutation: true, message: "Discard completed; ignored files and nested repositories were preserved.",
});
