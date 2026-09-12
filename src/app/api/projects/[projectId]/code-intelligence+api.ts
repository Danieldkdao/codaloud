import { codeIntelligenceRequestSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { authenticateProjectFilesRequest, projectFilesFailureResponse } from "@/features/projects/server/file-api";
import { readUserProjectCodeIntelligence } from "@/features/projects/server/project-files";
import { apiResponse } from "@/lib/utils";
import { SandboxFilesError } from "@/services/daytona/api";

export const POST = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    const userId = await authenticateProjectFilesRequest(request, projectId);
    const input = codeIntelligenceRequestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new SandboxFilesError(400, "INVALID_ANALYSIS_REQUEST", "Choose a supported file within the editor size limit.");
    const data = await readUserProjectCodeIntelligence(userId, projectId, input.data);
    const response = apiResponse({ error: false, message: "Code analyzed.", data });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return projectFilesFailureResponse(error); }
};
