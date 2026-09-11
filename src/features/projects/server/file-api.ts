import { getCurrentUser } from "@/lib/auth/helpers";
import { apiResponse, isValidIds } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";

export const projectFilesFailureResponse = (error: unknown) => {
  const response = error instanceof SandboxFilesError
    ? apiResponse({ error: true, message: error.message, code: error.code }, error.status)
    : apiResponse({ error: true, message: "Unable to access project files. Please try again." }, 502);
  if (error instanceof SandboxFilesError && error.code === "WORKSPACE_RESTORING") {
    response.headers.set("Retry-After", "3");
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export const authenticateProjectFilesRequest = async (request: Request, projectId: string) => {
  const { userId } = await getCurrentUser(request.headers);
  if (!userId) throw new SandboxFilesError(401, "UNAUTHENTICATED", "Sign in to access project files.");
  if (!isValidIds(projectId)) throw new SandboxFilesError(400, "INVALID_PROJECT", "Invalid project ID.");
  return userId;
};
