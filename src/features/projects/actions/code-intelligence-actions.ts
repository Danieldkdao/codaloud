import {
  codeIntelligenceRequestSchema,
  type CodeIntelligenceRequestSchema,
  type CodeIntelligenceResultSchema,
} from "./code-intelligence-schemas";
import { projectFileContentSchema } from "./file-schemas";
import { requireLocalProject } from "../local/access";
import { executeWorkspace } from "@/services/local-workspace/execute";

export const readProjectCodeIntelligence = async (
  projectId: string,
  unsafeInput: CodeIntelligenceRequestSchema,
): Promise<CodeIntelligenceResultSchema | null> => {
  try {
    const input = codeIntelligenceRequestSchema.parse(unsafeInput);
    const project = await requireLocalProject(projectId);
    const { analyzeTypeScript } =
      await import("@/services/typescript/analysis");
    return await analyzeTypeScript(input, async (path) => {
      try {
        return projectFileContentSchema.parse(
          await executeWorkspace(project.id, "read-file", { path }),
        ).content;
      } catch {
        return null;
      }
    });
  } catch {
    return null;
  }
};
