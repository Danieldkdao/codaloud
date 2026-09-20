import {
  codeIntelligenceRequestSchema,
  type CodeIntelligenceRequestSchema,
  type CodeIntelligenceResultSchema,
} from "./code-intelligence-schemas";
import { z } from "zod";
import { projectFileContentSchema, projectFileEntrySchema } from "./file-schemas";
import { requireLocalProject } from "../local/access";
import { executeWorkspace } from "@/services/local-workspace/execute";
import type { createTypeScriptAnalyzer } from "@/services/typescript/analysis";

// Bound compiler memory to the active workspace. The analyzer itself retains
// only the active file's graph and serializes requests against that graph.
let session:
  | {
      projectId: string;
      analyzer: ReturnType<typeof createTypeScriptAnalyzer>;
    }
  | undefined;

export const readProjectCodeIntelligence = async (
  projectId: string,
  unsafeInput: CodeIntelligenceRequestSchema,
): Promise<CodeIntelligenceResultSchema | null> => {
  try {
    const input = codeIntelligenceRequestSchema.parse(unsafeInput);
    const project = await requireLocalProject(projectId);
    const { createTypeScriptAnalyzer } =
      await import("@/services/typescript/analysis");
    if (session?.projectId !== project.id) {
      void session?.analyzer.dispose();
      session = {
        projectId: project.id,
        analyzer: createTypeScriptAnalyzer(async (path) => {
          try {
            return projectFileContentSchema.parse(
              await executeWorkspace(project.id, "read-file", { path }),
            ).content;
          } catch {
            return null;
          }
        }, async (path) => {
          try {
            return z.array(projectFileEntrySchema).parse(await executeWorkspace(project.id, "list-files", { path }));
          } catch { return []; }
        }),
      };
    }
    return await session.analyzer.analyze(input);
  } catch {
    return null;
  }
};
