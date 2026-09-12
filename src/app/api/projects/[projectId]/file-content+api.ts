import { projectFilePathSchema, saveProjectFileContentSchema } from "@/features/projects/actions/file-schemas";
import { authenticateProjectFilesRequest, projectFilesFailureResponse } from "@/features/projects/server/file-api";
import { readUserProjectFileContent, saveUserProjectFileContent } from "@/features/projects/server/project-files";
import { apiResponse, getContentType } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";

export const GET = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    const path = projectFilePathSchema.safeParse(new URL(request.url).searchParams.get("path"));
    if (!path.success) throw new SandboxFilesError(400, "INVALID_PATH", "Choose a file inside this project.");
    const fileContent = await readUserProjectFileContent(userId, projectId, path.data);
    const response = apiResponse({ error: false, message: "File loaded.", data: fileContent });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return projectFilesFailureResponse(error); }
};

export const PUT = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    if (getContentType(request.headers) !== "application/json") {
      throw new SandboxFilesError(415, "INVALID_CONTENT_TYPE", "Send a JSON file request.");
    }
    const input = saveProjectFileContentSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new SandboxFilesError(400, "INVALID_SAVE_REQUEST", input.error.issues[0]?.message ?? "Invalid file save request.");
    const savedFile = await saveUserProjectFileContent(userId, projectId, input.data);
    const response = apiResponse({ error: false, message: "File saved.", data: savedFile });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return projectFilesFailureResponse(error); }
};
