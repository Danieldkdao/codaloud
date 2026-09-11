import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import { authenticateProjectFilesRequest, projectFilesFailureResponse } from "@/features/projects/server/file-api";
import { readUserProjectFileContent } from "@/features/projects/server/project-files";
import { apiResponse } from "@/lib/utils";
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
