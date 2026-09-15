import { projectCommitDetailsParamsSchema, type ProjectCommitDetailsSchema } from "@/features/projects/actions/commit-details-schemas";
import { validateProjectCommitDetails } from "@/features/projects/server/commit-details";
import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";
import { readSandboxCommitDetails } from "@/services/daytona/commit-details";
import { readGitHubCommitDetails } from "@/services/github/server/commit-details";

const commitDetailsResponse = (body: ApiResponse<ProjectCommitDetailsSchema>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING") response.headers.set("Retry-After", "3");
  return response;
};

export const GET = async (request: Request, { projectId, commitSha }: { projectId: string; commitSha: string }) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return commitDetailsResponse({ error: true, code: "UNAUTHENTICATED", message: "Sign in to view commit details." }, 401);
    const query = new URL(request.url).searchParams;
    const params = projectCommitDetailsParamsSchema.safeParse({ projectId, commitSha, source: query.get("source") });
    if (!params.success || query.getAll("source").length !== 1 || [...query.keys()].some(key => key !== "source")) {
      return commitDetailsResponse({ error: true, code: "INVALID_COMMIT_PARAMS", message: "Provide a valid project, full commit SHA, and commit source." }, 400);
    }
    const readDetails = params.data.source === "local" ? readSandboxCommitDetails : readGitHubCommitDetails;
    const details = await readDetails(request.headers, projectId, commitSha, request.signal);
    const data = validateProjectCommitDetails(details, params.data);
    return commitDetailsResponse({ error: false, message: "Commit details loaded.", data });
  } catch (error) {
    if (error instanceof SandboxFilesError) return commitDetailsResponse({ error: true, code: error.code, message: error.message }, error.status);
    return commitDetailsResponse({ error: true, code: "COMMIT_DETAILS_UNAVAILABLE", message: "Unable to load commit details. Please try again." }, 502);
  }
};
