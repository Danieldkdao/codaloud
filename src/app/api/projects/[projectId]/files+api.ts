import { getCurrentUser } from "@/lib/auth/helpers";
import { apiResponse, getContentType, isValidIds } from "@/lib/utils";
import { createProjectFileSchema, projectDirectoryPathSchema } from "@/features/projects/actions/file-schemas";
import { createUserProjectFile, readUserProjectFiles } from "@/features/projects/server/project-files";
import { SandboxFilesError } from "@/services/daytona/api";

const failureResponse = (error: unknown) => {
  if (error instanceof SandboxFilesError) {
    const response = apiResponse({ error: true, message: error.message, code: error.code }, error.status);
    if (error.code === "WORKSPACE_RESTORING") response.headers.set("Retry-After", "3");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return apiResponse({ error: true, message: "Unable to access project files. Please try again." }, 502);
};

const authenticate = async (request: Request, projectId: string) => {
  const { userId } = await getCurrentUser(request.headers);
  if (!userId) throw new SandboxFilesError(401, "UNAUTHENTICATED", "Sign in to access project files.");
  if (!isValidIds(projectId)) throw new SandboxFilesError(400, "INVALID_PROJECT", "Invalid project ID.");
  return userId;
};

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticate(request, projectId);
    const path = projectDirectoryPathSchema.safeParse(new URL(request.url).searchParams.get("path") ?? "");
    if (!path.success) return apiResponse({ error: true, message: "Invalid folder path." }, 400);
    const files = await readUserProjectFiles(userId, projectId, path.data);
    const response = apiResponse({ error: false, message: "Files loaded.", data: files });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return failureResponse(error); }
};

export const POST = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticate(request, projectId);
    if (getContentType(request.headers) !== "application/json") {
      return apiResponse({ error: true, message: "Send a JSON file request." }, 415);
    }
    const input = createProjectFileSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return apiResponse({ error: true, message: input.error.issues[0]?.message ?? "Invalid file request." }, 400);
    const createdFile = await createUserProjectFile(userId, projectId, input.data);
    return apiResponse({ error: false, message: "Created successfully.", data: createdFile }, 201);
  } catch (error) { return failureResponse(error); }
};
