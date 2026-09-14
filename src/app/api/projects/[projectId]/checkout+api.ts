import { checkoutProjectBranchSchema, type ProjectBranchCheckoutSchema } from "@/features/projects/actions/branch-schemas";
import { checkoutUserProjectBranch } from "@/features/projects/server/project-checkout";
import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse, getContentType, isValidIds } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";

const checkoutResponse = (body: ApiResponse<ProjectBranchCheckoutSchema>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING") response.headers.set("Retry-After", "3");
  return response;
};

export const POST = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return checkoutResponse({ error: true, code: "UNAUTHENTICATED", message: "Sign in to switch branches." }, 401);
    if (!isValidIds(projectId)) return checkoutResponse({ error: true, code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
    if (getContentType(request.headers) !== "application/json") {
      return checkoutResponse({ error: true, code: "INVALID_CONTENT_TYPE", message: "Send a JSON body containing branchName." }, 415);
    }
    const input = checkoutProjectBranchSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return checkoutResponse({ error: true, code: "INVALID_BRANCH", message: "Send a valid branchName without checkout options or extra fields." }, 400);
    }
    const result = await checkoutUserProjectBranch(userId, request.headers, projectId, input.data, request.signal);
    return checkoutResponse({ error: false, message: "Branch checked out successfully.", data: result });
  } catch (error) {
    if (error instanceof SandboxFilesError) {
      return checkoutResponse({ error: true, code: error.code, message: error.message }, error.status);
    }
    return checkoutResponse({ error: true, code: "CHECKOUT_UNAVAILABLE", message: "Unable to prepare the branch switch. Refresh the workspace and try again." }, 502);
  }
};
