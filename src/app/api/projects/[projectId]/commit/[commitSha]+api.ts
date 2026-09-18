import {
  projectCommitDetailsParamsSchema,
  projectCommitDetailsSchema,
} from "@/features/projects/actions/commit-details-schemas";
import { validateProjectCommitDetails } from "@/features/projects/server/commit-details";
import { createGitRoute } from "@/features/projects/server/git-route";
import { readSandboxCommitDetails } from "@/services/daytona/commit-details";
import { readGitHubCommitDetails } from "@/services/github/server/commit-details";

export const GET = createGitRoute({
  input: projectCommitDetailsParamsSchema,
  output: projectCommitDetailsSchema,
  query: (query, params) => ({
    ...Object.fromEntries(query),
    projectId: params.projectId,
    commitSha: params.commitSha,
  }),
  message: "Commit details loaded.",
  errors: {
    input: {
      code: "INVALID_COMMIT_PARAMS",
      message: "Provide a valid project, full commit SHA, and commit source.",
    },
    unavailable: {
      code: "COMMIT_DETAILS_UNAVAILABLE",
      message: "Unable to load commit details. Please try again.",
    },
  },
  execute: async ({ request, input }) => {
    const readDetails =
      input.source === "local"
        ? readSandboxCommitDetails
        : readGitHubCommitDetails;
    const details = await readDetails(
      request.headers,
      input.projectId,
      input.commitSha,
      request.signal,
    );
    return validateProjectCommitDetails(details, input);
  },
});
