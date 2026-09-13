import {
  projectCommitPageSchema,
  type ProjectCommitPageSchema,
} from "@/features/projects/actions/commit-schemas";
import { projectCommitParamsSchema } from "@/features/projects/lib/commit-params";
import { CommitHistoryError } from "@/features/projects/server/commit-pagination";
import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse, isValidIds } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";
import { readSandboxCommits } from "@/services/daytona/commits";
import { readGitHubCommits } from "@/services/github/server/commits";

const commitsResponse = (body: ApiResponse<ProjectCommitPageSchema>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING") {
    response.headers.set("Retry-After", "3");
  }
  return response;
};

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) {
      return commitsResponse({ error: true, code: "UNAUTHENTICATED", message: "Sign in to view commit history." }, 401);
    }
    if (!isValidIds(projectId)) {
      return commitsResponse({ error: true, code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
    }

    const query = new URL(request.url).searchParams;
    const params = projectCommitParamsSchema.safeParse({
      projectId,
      source: query.get("source") ?? undefined,
      branch: query.get("branch") ?? undefined,
      search: query.get("search") ?? undefined,
      author: query.get("author") ?? undefined,
      cursor: query.get("cursor") ?? undefined,
      pageSize: query.get("pageSize") ?? undefined,
    });
    if (!params.success) {
      return commitsResponse({ error: true, code: "INVALID_COMMIT_PARAMS", message: "Invalid commit source, branch, search or pagination." }, 400);
    }

    const { source, projectId: validatedProjectId, ...input } = params.data;
    const readCommits = source === "local" ? readSandboxCommits : readGitHubCommits;
    // Each reader rechecks the session and project ownership before provider access.
    const commits = await readCommits(request.headers, validatedProjectId, input, request.signal);
    const data = projectCommitPageSchema.parse(commits);
    return commitsResponse({ error: false, message: "Project commits loaded.", data });
  } catch (error) {
    if (error instanceof CommitHistoryError || error instanceof SandboxFilesError) {
      return commitsResponse({ error: true, code: error.code, message: error.message }, error.status);
    }
    return commitsResponse({ error: true, code: "COMMITS_UNAVAILABLE", message: "Unable to load project commits. Please try again." }, 502);
  }
};
