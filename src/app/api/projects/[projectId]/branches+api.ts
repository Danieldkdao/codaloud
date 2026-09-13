import type { ProjectBranchPageSchema } from "@/features/projects/actions/branch-schemas";
import { projectBranchParamsSchema } from "@/features/projects/lib/branch-params";
import { readUserProjectBranches } from "@/features/projects/server/project-branches";
import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse, isValidIds } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";

const branchesResponse = (body: ApiResponse<ProjectBranchPageSchema>, status = 200) => {
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
      return branchesResponse({ error: true, code: "UNAUTHENTICATED", message: "Sign in to view project branches." }, 401);
    }
    if (!isValidIds(projectId)) {
      return branchesResponse({ error: true, code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
    }
    const query = new URL(request.url).searchParams;
    const params = projectBranchParamsSchema.safeParse({
      projectId,
      search: query.get("search") ?? undefined,
      cursor: query.get("cursor") ?? undefined,
      pageSize: query.get("pageSize") ?? undefined,
    });
    if (!params.success) {
      return branchesResponse({ error: true, code: "INVALID_BRANCH_PARAMS", message: params.error.issues[0]?.message ?? "Invalid branch search or pagination." }, 400);
    }
    const branches = await readUserProjectBranches(userId, params.data);
    return branchesResponse({ error: false, message: "Project branches loaded.", data: branches });
  } catch (error) {
    if (error instanceof SandboxFilesError) {
      return branchesResponse({ error: true, code: error.code, message: error.message }, error.status);
    }
    return branchesResponse({ error: true, code: "BRANCHES_UNAVAILABLE", message: "Unable to load project branches. Please try again." }, 502);
  }
};
