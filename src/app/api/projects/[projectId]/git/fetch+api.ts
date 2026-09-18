import { z } from "zod";
import { createGitRoute } from "@/features/projects/server/git-route";
import { gitCountsSchema } from "@/features/projects/server/git-schemas";
import { sandboxGitFetchCommand } from "@/services/daytona/git-fetch-command";

export const POST = createGitRoute({
  input: z.strictObject({}),
  output: gitCountsSchema,
  script: sandboxGitFetchCommand,
  mutation: true,
  remote: "read",
  message: "Remote branches fetched and tracking counts refreshed.",
});
