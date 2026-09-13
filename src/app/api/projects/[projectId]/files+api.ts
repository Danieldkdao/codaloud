import { apiResponse, getContentType } from "@/lib/utils";
import { createProjectFileSchema, deleteProjectFileSchema, projectDirectoryPathSchema, updateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { createUserProjectFile, deleteUserProjectFile, readUserProjectFiles, searchUserProjectFiles, updateUserProjectFile } from "@/features/projects/server/project-files";
import { authenticateProjectFilesRequest, projectFilesFailureResponse } from "@/features/projects/server/file-api";
import { projectFileSearchQuerySchema } from "@/features/projects/actions/file-search-schemas";
import { SandboxFilesError } from "@/services/daytona/api";

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    const params = new URL(request.url).searchParams;
    if (params.has("search")) {
      const fields = ["search", "scope", "path", "pageSize", "cursor"];
      const input = projectFileSearchQuerySchema.safeParse(Object.fromEntries(
        fields.filter((field) => params.has(field)).map((field) => [field, params.get(field)]),
      ));
      if (!input.success || fields.some((field) => params.getAll(field).length > 1)
        || (params.has("pageSize") && !/^[0-9]+$/.test(params.get("pageSize")!))) {
        throw new SandboxFilesError(400, "INVALID_FILE_SEARCH", "Invalid file search or pagination parameters.");
      }
      const data = await searchUserProjectFiles(userId, projectId, input.data, request.signal);
      const response = apiResponse({ error: false, message: "Search results loaded.", data });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    if (["scope", "pageSize", "cursor"].some((field) => params.has(field))) {
      throw new SandboxFilesError(400, "INVALID_FILE_SEARCH", "Include a search query when requesting search pages.");
    }
    const path = projectDirectoryPathSchema.safeParse(params.get("path") ?? "");
    if (!path.success) return apiResponse({ error: true, message: "Invalid folder path." }, 400);
    const files = await readUserProjectFiles(userId, projectId, path.data);
    const response = apiResponse({ error: false, message: "Files loaded.", data: files });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return projectFilesFailureResponse(error); }
};

export const POST = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    if (getContentType(request.headers) !== "application/json") {
      return apiResponse({ error: true, message: "Send a JSON file request." }, 415);
    }
    const input = createProjectFileSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return apiResponse({ error: true, message: input.error.issues[0]?.message ?? "Invalid file request." }, 400);
    const createdFile = await createUserProjectFile(userId, projectId, input.data);
    return apiResponse({ error: false, message: "Created successfully.", data: createdFile }, 201);
  } catch (error) { return projectFilesFailureResponse(error); }
};

export const PATCH = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    if (getContentType(request.headers) !== "application/json") {
      return apiResponse({ error: true, message: "Send a JSON file request." }, 415);
    }
    const input = updateProjectFileSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return apiResponse({ error: true, message: input.error.issues[0]?.message ?? "Invalid file request." }, 400);
    const updatedFile = await updateUserProjectFile(userId, projectId, input.data);
    return apiResponse({ error: false, message: "Updated successfully.", data: updatedFile });
  } catch (error) { return projectFilesFailureResponse(error); }
};

export const DELETE = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    if (getContentType(request.headers) !== "application/json") {
      return apiResponse({ error: true, message: "Send a JSON file request." }, 415);
    }
    const input = deleteProjectFileSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return apiResponse({ error: true, message: input.error.issues[0]?.message ?? "Invalid file request." }, 400);
    const deletedFile = await deleteUserProjectFile(userId, projectId, input.data);
    return apiResponse({ error: false, message: "Deleted successfully.", data: deletedFile });
  } catch (error) { return projectFilesFailureResponse(error); }
};
