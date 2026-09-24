import { CODE_INTELLIGENCE_FILE_PATTERN } from "@/features/projects/constants";
import type { CodeIntelligenceResultSchema } from "@/features/projects/actions/code-intelligence-schemas";

// Native-only: use the same compiler service as the editor, never a cloud copy
// of the file or an executable lint configuration from the repository.
export const collectFileDiagnostics = async (
  projectId: string,
  path: string,
  content: string,
) => {
  const unavailable = (status: "unsupported" | "unavailable") => ({
    engine: "typescript" as const,
    status,
    items: [],
    total: null,
    truncated: false,
  });
  if (!CODE_INTELLIGENCE_FILE_PATTERN.test(path))
    return unavailable("unsupported");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const analysis = await Promise.race([
      (async () => {
        const { readProjectCodeIntelligence } =
          await import("@/features/projects/actions/code-intelligence-actions");
        return readProjectCodeIntelligence(projectId, { path, content });
      })(),
      // Do not hold a file read behind slow dependency IO. The shared editor
      // analyzer may finish later; disposing it here would interrupt the editor.
      new Promise<CodeIntelligenceResultSchema | null>((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
    if (!analysis || !("diagnostics" in analysis))
      return unavailable("unavailable");
    const items = analysis.diagnostics.slice(0, 20).map((item) => {
      const lines = content
        .slice(0, item.from)
        .split(/\r\n|\r|\n|\u2028|\u2029/);
      return {
        ...item,
        message: item.message.slice(0, 200),
        messageTruncated: item.message.length > 200,
        line: lines.length,
        column: lines.at(-1)!.length + 1,
      };
    });
    const result = {
      engine: "typescript" as const,
      status: "ready" as const,
      items,
      total: analysis.diagnostics.length,
      truncated:
        analysis.diagnostics.length > items.length ||
        items.some((item) => item.messageTruncated),
    };
    // JSON escaping and multi-byte messages also count against LiveKit's limit.
    while (
      new TextEncoder().encode(JSON.stringify(result)).length > 2000 &&
      items.length
    ) {
      items.pop();
      result.truncated = true;
    }
    return result;
  } catch {
    return unavailable("unavailable");
  } finally {
    clearTimeout(timer);
  }
};
