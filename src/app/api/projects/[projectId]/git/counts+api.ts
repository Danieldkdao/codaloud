import { z } from "zod";
import { createGitRoute } from "@/features/projects/server/git-route";
import { gitCountsSchema } from "@/features/projects/server/git-schemas";
import { sandboxGitCountsCommand } from "@/services/daytona/git-counts-command";

export const GET = createGitRoute({
  input: z.strictObject({}), output: gitCountsSchema, script: sandboxGitCountsCommand,
  message: "Git tracking counts loaded. Fetch to refresh remote state.",
});
