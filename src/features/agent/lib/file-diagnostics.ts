import { createCodeAnalyzerRegistry } from "@/features/code-intelligence/analyzer-registry";
import type {
  AnalyzerLoaderOptions,
  CodeAnalyzerResult,
} from "@/features/code-intelligence/analyzer-registry";
import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { getCodeFileType } from "@/features/code-intelligence/file-type";
import type { CodeFileType } from "@/features/code-intelligence/file-type";

type DiagnosticsEngine =
  "typescript" | "tree-sitter" | "format-parser" | "none";

// Runs in both the app and the Node worker, so it imports neither React Native
// nor Node builtins; the worker registers resolvers, the app keeps Metro's.
let hostOptions: AnalyzerLoaderOptions | undefined;

/** Registers the host's runtime resolvers. Called by the Node worker only. */
export const setDiagnosticsAnalyzerOptions = (
  options: AnalyzerLoaderOptions,
) => {
  hostOptions = options;
};

/** Forgets the host resolvers, restoring the app's own Metro defaults. */
export const clearDiagnosticsAnalyzerOptions = () => {
  hostOptions = undefined;
};

/** The host's options when one registered, else undefined so the registry keeps
 * its Metro defaults; exported so a wrong choice is assertable, not silent. */
export const resolveDiagnosticsAnalyzerOptions = () => hostOptions;

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

// Native-only: the editor's own compiler service, never a cloud copy; the Node
// worker supplies `loadWasmBytes` because this module is bundled into the app.

/** Hermes has neither WebAssembly nor a full TextDecoder, so the wasm analyzers
 * throw there; the WebView and Node hosts answer true and keep the fast path. */
const supportsWebAssembly = () =>
  typeof WebAssembly !== "undefined" &&
  typeof WebAssembly.instantiate === "function";

// Bounded so a wedged server cannot hold a file read open; see the RPC note on
// localTimeoutMs for why this must stay under the LiveKit deadline too.
const remoteTimeoutMs = 12000;

// A cold graph re-reads every dependency and queues behind the editor, and a
// two-second race read to the agent as "no TypeScript diagnostics".
const localTimeoutMs = 10000;

type DiagnosticsAnalysis = {
  status: "ready" | "unavailable" | "unsupported";
  diagnostics: CodeDiagnosticSchema[];
};

/** Asks the server to run the wasm analyzers this host cannot host. */
const analyzeRemotely = async (
  path: string,
  content: string,
): Promise<DiagnosticsAnalysis> => {
  const { requestRemoteDiagnostics } =
    await import("@/features/code-intelligence/diagnostics-actions");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remoteTimeoutMs);
  try {
    const result = await requestRemoteDiagnostics(
      { path, content },
      controller.signal,
    );
    if (!result) return { status: "unavailable", diagnostics: [] };
    return result.status === "ready"
      ? { status: "ready", diagnostics: result.diagnostics }
      : { status: result.status, diagnostics: [] };
  } catch {
    return { status: "unavailable", diagnostics: [] };
  } finally {
    clearTimeout(timer);
  }
};

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

  // A tree-sitter engine means a wasm runtime, and this host has none; running here
  // would call the file clean without reading it, so the analyzers move to the server.
  const remote = engine === "tree-sitter" && !supportsWebAssembly();
  const analyzer = remote
    ? undefined
    : createCodeAnalyzerRegistry(
        path,
        (input) =>
          import("@/features/projects/actions/code-intelligence-actions").then(
            ({ readProjectCodeIntelligence }) =>
              readProjectCodeIntelligence(projectId, input),
          ),
        undefined,
        // undefined keeps the registry's own Metro resolvers, which is what the app
        // needs. Only the worker overrides them, because it has no bundler.
        resolveDiagnosticsAnalyzerOptions(),
      );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let analysis: DiagnosticsAnalysis | null;
    if (remote) {
      analysis = await analyzeRemotely(path, content);
    } else {
      const raced = await Promise.race([
        analyzer!.analyzeFile({ path, content, revision: 1 }),
        // Do not hold a file read behind slow dependency IO. The shared editor
        // analyzer may finish later; disposing it here would interrupt the editor.
        new Promise<CodeAnalyzerResult | null>((resolve) => {
          timer = setTimeout(() => resolve(null), localTimeoutMs);
        }),
      ]);
      analysis = raced
        ? { status: raced.status, diagnostics: raced.diagnostics }
        : null;
    }
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
    analyzer?.dispose();
  }
};
