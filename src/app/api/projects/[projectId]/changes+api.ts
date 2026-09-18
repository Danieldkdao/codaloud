import { z } from "zod";
import { projectRepositoryChangesSchema } from "@/features/projects/actions/change-schemas";
import { createGitRoute } from "@/features/projects/server/git-route";
import { readSandboxChanges } from "@/services/daytona/changes";

export const GET = createGitRoute({
  input: z.strictObject({}),
  output: projectRepositoryChangesSchema,
  message: "Project changes loaded.",
  errors: {
    unavailable: { code: "CHANGES_UNAVAILABLE", message: "Unable to load project changes. Please try again." },
  },
  execute: ({ request, params }) => readSandboxChanges(request.headers, params.projectId, request.signal),
});
