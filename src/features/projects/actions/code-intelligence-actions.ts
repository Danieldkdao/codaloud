import { codeIntelligenceRequestSchema, codeIntelligenceResultSchema, type CodeIntelligenceRequestSchema, type CodeIntelligenceResultSchema } from "./code-intelligence-schemas";
import { createRequestHeaders, fetchBase, isValidIds } from "@/lib/utils";

export const readProjectCodeIntelligence = async (
  projectId: string, unsafeInput: CodeIntelligenceRequestSchema,
): Promise<CodeIntelligenceResultSchema | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70_000);
  try {
    if (!isValidIds(projectId)) return null;
    const input = codeIntelligenceRequestSchema.parse(unsafeInput);
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.has("Cookie")) return null;
    const response = await fetchBase(`/api/projects/${projectId}/code-intelligence`, {
      method: "POST", headers, credentials: "omit", body: JSON.stringify(input), signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.error !== false) return null;
    const data = codeIntelligenceResultSchema.parse(result.data);
    if (input.position === undefined ? !("diagnostics" in data) : !("completions" in data)) return null;
    return data;
  } catch { return null; }
  finally { clearTimeout(timeout); }
};
