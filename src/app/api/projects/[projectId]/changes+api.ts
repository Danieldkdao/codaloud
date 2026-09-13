import { projectRepositoryChangesSchema, type ProjectRepositoryChangesSchema } from "@/features/projects/actions/change-schemas";
import { getCurrentUser } from "@/lib/auth/helpers";
import type { ApiResponse } from "@/lib/types";
import { apiResponse, isValidIds } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";
import { readSandboxChanges } from "@/services/daytona/changes";

const changesResponse = (body: ApiResponse<ProjectRepositoryChangesSchema>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING") response.headers.set("Retry-After", "3");
  return response;
};

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return changesResponse({ error: true, code: "UNAUTHENTICATED", message: "Sign in to view project changes." }, 401);
    if (!isValidIds(projectId)) return changesResponse({ error: true, code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
    // The reader also verifies ownership and sandbox binding before executing Git.
    const data = projectRepositoryChangesSchema.parse(await readSandboxChanges(request.headers, projectId, request.signal));
    return changesResponse({ error: false, message: "Project changes loaded.", data });
  } catch (error) {
    if (error instanceof SandboxFilesError) return changesResponse({ error: true, code: error.code, message: error.message }, error.status);
    return changesResponse({ error: true, code: "CHANGES_UNAVAILABLE", message: "Unable to load project changes. Please try again." }, 502);
  }
};
