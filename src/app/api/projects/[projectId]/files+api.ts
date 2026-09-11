import { apiResponse, getContentType } from "@/lib/utils";
import { createProjectFileSchema, deleteProjectFileSchema, projectDirectoryPathSchema, updateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { createUserProjectFile, deleteUserProjectFile, readUserProjectFiles, updateUserProjectFile } from "@/features/projects/server/project-files";
import { authenticateProjectFilesRequest, projectFilesFailureResponse } from "@/features/projects/server/file-api";

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    const path = projectDirectoryPathSchema.safeParse(new URL(request.url).searchParams.get("path") ?? "");
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
