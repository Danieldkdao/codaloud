import { projectCommitPageSchema } from "@/features/projects/actions/commit-schemas";
import { projectCommitParamsSchema } from "@/features/projects/lib/commit-params";
import {
  createProjectCommitSchema,
  projectCreatedCommitSchema,
} from "@/features/projects/actions/create-commit-schemas";
import { createGitRoute } from "@/features/projects/server/git-route";
import { commitUserProject } from "@/features/projects/server/project-commit";
import { readSandboxCommits } from "@/services/daytona/commits";
import { readGitHubCommits } from "@/services/github/server/commits";

export const POST = createGitRoute({
  input: createProjectCommitSchema,
  output: projectCreatedCommitSchema,
  mutation: true,
  // 5,000 paths of up to 4,096 characters, including JSON Unicode escapes.
  maxBodyBytes: 128 * 1024 * 1024,
  message: "Selected changes committed.",
  errors: {
    input: {
      code: "INVALID_COMMIT_INPUT",
      message:
        "Send a nonempty commit message and a nonempty list of unique repository-relative paths, without extra fields.",
    },
    unavailable: {
      status: 500,
      code: "COMMIT_REQUEST_UNAVAILABLE",
      message: "Unable to validate the commit request. Please try again.",
    },
    unknownOutcome: {
      code: "COMMIT_OUTCOME_UNKNOWN",
      message:
        "Unable to confirm the commit. Refresh commit history and Git changes before retrying; the commit may already exist.",
    },
  },
  execute: ({ request, params, input }) =>
    commitUserProject(request.headers, params.projectId, input, request.signal),
});

export const GET = createGitRoute({
  input: projectCommitParamsSchema,
  output: projectCommitPageSchema,
  query: (query, params) => ({
    ...Object.fromEntries(query),
    projectId: params.projectId,
  }),
  message: "Project commits loaded.",
  errors: {
    input: {
      code: "INVALID_COMMIT_PARAMS",
      message: "Invalid commit source, branch, search or pagination.",
    },
    unavailable: {
      code: "COMMITS_UNAVAILABLE",
      message: "Unable to load project commits. Please try again.",
    },
  },
  execute: ({ request, input: { source, projectId, ...input } }) => {
    const readCommits =
      source === "local" ? readSandboxCommits : readGitHubCommits;
    return readCommits(request.headers, projectId, input, request.signal);
  },
});
