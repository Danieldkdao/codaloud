import {
  type CodeDiagnosticSchema,
  type CodeIntelligenceRequestSchema,
  type CodeIntelligenceResultSchema,
} from "@/features/projects/actions/code-intelligence-schemas";
import {
  getCodeFileType,
  isFormatFileType,
  type CodeFileType,
} from "./file-type";
import { normalizeCodeDiagnostics } from "./diagnostics";
import type { TreeSitterGrammarId } from "./parsers/grammars";

export type CodeAnalyzerInput = {
  path: string;
  content: string;
  revision: number;
};

export type CodeAnalyzerResult = {
  status: "ready" | "unavailable" | "unsupported";
  revision: number;
  diagnostics: CodeDiagnosticSchema[];
};

type CodeAnalysisRequest = (
  input: CodeIntelligenceRequestSchema,
) => Promise<CodeIntelligenceResultSchema | null>;

type LocalAnalyzerResult = {
  status: "ready" | "unavailable";
  diagnostics: CodeDiagnosticSchema[];
};

type LocalAnalyzer = {
  analyze: (content: string) => Promise<LocalAnalyzerResult>;
  dispose: () => void;
};

type LocalAnalyzerLoader = (
  fileType: TreeSitterGrammarId | CodeFileType,
) => Promise<LocalAnalyzer>;

const treeSitterGrammarIds = new Set<string>([
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "php",
  "rust",
  "ruby",
]);

// Languages with a real compiler or linter running in-process. These are
// preferred over tree-sitter because they report the same messages the language
// itself would, including type and lint errors a grammar cannot see. Each is
// loaded lazily so opening a file never pays for a runtime it does not use.
const nativeLanguageLoaders: Partial<
  Record<TreeSitterGrammarId | CodeFileType, LocalAnalyzerLoader>
> = {
  ruby: async () => {
    const { createPrismAnalyzer } = await import("./parsers/prism-analyzer");
    return createPrismAnalyzer();
  },
  python: async () => {
    const { createPythonAnalyzer } = await import("./parsers/python-analyzer");
    return createPythonAnalyzer();
  },
  shell: async () => {
    const { createShellCheckAnalyzer } =
      await import("./parsers/shellcheck-analyzer");
    return createShellCheckAnalyzer();
  },
};

const loadLocalAnalyzer: LocalAnalyzerLoader = async (fileType) => {
  const nativeLanguageLoader = nativeLanguageLoaders[fileType];
  if (nativeLanguageLoader) return nativeLanguageLoader(fileType);
  if (isFormatFileType(fileType)) {
    const { createFormatAnalyzer } = await import("./format-analyzer");
    return createFormatAnalyzer(fileType);
  }
  const { createTreeSitterLanguageAnalyzer } =
    await import("./parsers/grammar-loader");
  return createTreeSitterLanguageAnalyzer(fileType as TreeSitterGrammarId);
};

// A native runtime is much slower than a tree-sitter parse. Pyodide in
// particular boots a full CPython interpreter on first use, which takes
// seconds, so a short debounce would restart that work on every keystroke.
// These languages settle for a longer pause before analysis, which keeps typing
// responsive and lets the runtime finish once the user stops.
const nativeLanguageDebounceMs: Partial<
  Record<TreeSitterGrammarId | CodeFileType, number>
> = {
  python: 900,
  c: 900,
  cpp: 900,
  php: 900,
  shell: 400,
  ruby: 250,
};

const getDebounceMs = (fileType: CodeFileType) => {
  if (fileType === "typescript" || fileType === "javascript") return 150;
  return nativeLanguageDebounceMs[fileType] ?? 250;
};

const unavailableResult = (
  status: "unavailable" | "unsupported",
  revision: number,
): CodeAnalyzerResult => ({ status, revision, diagnostics: [] });

const getDiagnosticResult = (
  result: CodeIntelligenceResultSchema | null,
  content: string,
  revision: number,
): CodeAnalyzerResult => {
  if (!result || !("diagnostics" in result))
    return unavailableResult("unavailable", revision);
  return {
    status: "ready",
    revision,
    diagnostics: normalizeCodeDiagnostics(content, result.diagnostics),
  };
};

export const createCodeAnalyzerRegistry = (
  path: string,
  request: CodeAnalysisRequest,
  loadAnalyzer: LocalAnalyzerLoader = loadLocalAnalyzer,
) => {
  const fileType = getCodeFileType(path);
  let disposed = false;
  let localAnalyzerPromise: Promise<LocalAnalyzer> | undefined;
  let localAnalyzer: LocalAnalyzer | undefined;
  let localAnalyzerDisposed = false;

  const disposeLocalAnalyzer = (analyzer: LocalAnalyzer) => {
    if (localAnalyzerDisposed) return;
    localAnalyzerDisposed = true;
    analyzer.dispose();
  };

  const analyzeFile = async (
    input: CodeAnalyzerInput,
  ): Promise<CodeAnalyzerResult> => {
    if (disposed) return unavailableResult("unavailable", input.revision);

    if (fileType === "typescript" || fileType === "javascript") {
      try {
        const result = await request({
          path: input.path,
          content: input.content,
        });
        return disposed
          ? unavailableResult("unavailable", input.revision)
          : getDiagnosticResult(result, input.content, input.revision);
      } catch {
        return unavailableResult("unavailable", input.revision);
      }
    }

    if (!treeSitterGrammarIds.has(fileType) && !isFormatFileType(fileType))
      return unavailableResult("unsupported", input.revision);

    try {
      localAnalyzerPromise ??= loadAnalyzer(
        fileType as TreeSitterGrammarId | CodeFileType,
      );
      const analyzer = await localAnalyzerPromise;
      localAnalyzer = analyzer;
      if (disposed) {
        disposeLocalAnalyzer(analyzer);
        return unavailableResult("unavailable", input.revision);
      }
      const result = await analyzer.analyze(input.content);
      return {
        status: result.status,
        revision: input.revision,
        diagnostics: normalizeCodeDiagnostics(
          input.content,
          result.diagnostics,
        ),
      };
    } catch {
      return unavailableResult("unavailable", input.revision);
    }
  };

  return {
    debounceMs: getDebounceMs(fileType),
    analyzeFile,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (localAnalyzer) disposeLocalAnalyzer(localAnalyzer);
      else
        void localAnalyzerPromise?.then(disposeLocalAnalyzer).catch(() => {});
    },
  };
};
