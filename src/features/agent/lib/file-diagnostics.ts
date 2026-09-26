import { createCodeAnalyzerRegistry } from "@/features/code-intelligence/analyzer-registry";
import { getCodeFileType } from "@/features/code-intelligence/file-type";
import type { CodeFileType } from "@/features/code-intelligence/file-type";
import type { CodeAnalyzerResult } from "@/features/code-intelligence/analyzer-registry";

type DiagnosticsEngine =
  "typescript" | "tree-sitter" | "format-parser" | "none";

const getDiagnosticsEngine = (fileType: CodeFileType): DiagnosticsEngine => {
  switch (fileType) {
    case "typescript":
    case "javascript":
      return "typescript";
    case "python":
    case "java":
    case "c":
    case "cpp":
    case "csharp":
    case "go":
    case "php":
    case "rust":
    case "ruby":
    case "shell":
    case "dockerfile":
      return "tree-sitter";
    case "markdown":
    case "json":
    case "jsonc":
    case "json5":
    case "yaml":
    case "toml":
    case "xml":
    case "ini":
    case "env":
      return "format-parser";
    case "unsupported":
      return "none";
    default: {
      const exhaustive: never = fileType;
      return exhaustive;
    }
  }
};

// Native-only: use the same compiler service as the editor, never a cloud copy
// of the file or an executable lint configuration from the repository.
export const collectFileDiagnostics = async (
  projectId: string,
  path: string,
  content: string,
) => {
  const fileType = getCodeFileType(path);
  const engine = getDiagnosticsEngine(fileType);
  const unavailable = (status: "unsupported" | "unavailable") => ({
    engine,
    status,
    items: [],
    total: null,
    truncated: false,
  });
  if (engine === "none") return unavailable("unsupported");

  const analyzer = createCodeAnalyzerRegistry(path, (input) =>
    import("@/features/projects/actions/code-intelligence-actions").then(
      ({ readProjectCodeIntelligence }) =>
        readProjectCodeIntelligence(projectId, input),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const analysis = await Promise.race([
      analyzer.analyzeFile({ path, content, revision: 1 }),
      // Do not hold a file read behind slow dependency IO. The shared editor
      // analyzer may finish later; disposing it here would interrupt the editor.
      new Promise<CodeAnalyzerResult | null>((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
    if (!analysis) return unavailable("unavailable");
    if (analysis.status !== "ready") return unavailable(analysis.status);
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
      engine,
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
    analyzer.dispose();
  }
};
