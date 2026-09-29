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
import { createNativeWasmLoader } from "./parsers/analyzer-asset-url";
import type { AnalyzerWasmLoader } from "./parsers/analyzer-asset-url";
import { createWarmPreferredAnalyzer } from "./parsers/analyzer-fallback";
import {
  analyzerAssetSpecifiers,
  resolveVendoredAsset,
} from "./parsers/vendored-asset";
import type { ResolveAssetLocation } from "./parsers/vendored-asset";
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
  options: AnalyzerLoaderOptions,
) => Promise<LocalAnalyzer>;

export type { AnalyzerWasmLoader };
export type { ResolveAssetLocation };

export type AnalyzerLoaderOptions = {
  loadWasmBytes: AnalyzerWasmLoader;
  resolveAssetLocation: ResolveAssetLocation;
};

const prismRuntime = () =>
  resolveVendoredAsset(analyzerAssetSpecifiers.prismRuntime, () =>
    require("./parsers/runtimes/prism.wasm"),
  );
const shellcheckRuntime = () =>
  resolveVendoredAsset(analyzerAssetSpecifiers.shellcheckRuntime, () =>
    require("./parsers/runtimes/shellcheck.wasm"),
  );

let scheduledPyodideWarm: Promise<void> | undefined;
const warmPythonWhenIdle = () => {
  scheduledPyodideWarm ??= new Promise<void>((resolve) => {
    const start = () => resolve();
    if (typeof requestIdleCallback === "function")
      requestIdleCallback(start, { timeout: 1800 });
    else setTimeout(start, 900);
  })
    .then(async () => {
      const python = await import("./parsers/python-analyzer");
      await python.warmPyodideRuntime();
    })
    .catch((error) => {
      scheduledPyodideWarm = undefined;
      throw error;
    });
  return scheduledPyodideWarm;
};

// The editor's default reader: a Metro asset id turned into a fetchable url.
const loadEditorWasmBytes: AnalyzerWasmLoader = async (asset) => {
  const load = await createNativeWasmLoader();
  return load(asset);
};

// React Native is imported dynamically, so this module stays loadable in the Node
// worker, which resolves assets from disk instead.
const resolveEditorAssetLocation: ResolveAssetLocation = async (asset) => {
  const { resolveNativeAssetUrl } = await import("./parsers/native-runtime");
  return resolveNativeAssetUrl(asset);
};

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

const nativeLanguageLoaders: Partial<
  Record<TreeSitterGrammarId | CodeFileType, LocalAnalyzerLoader>
> = {
  ruby: async (_fileType, options) => {
    const { createPrismAnalyzer } = await import("./parsers/prism-analyzer");
    return createPrismAnalyzer(() => options.loadWasmBytes(prismRuntime()));
  },
  python: async (_fileType, options) => {
    const [
      { createPythonAnalyzer, setPyodideRuntimeLoader, isPyodideRuntimeReady },
      grammarLoader,
    ] = await Promise.all([
      import("./parsers/python-analyzer"),
      import("./parsers/grammar-loader"),
    ]);
    setPyodideRuntimeLoader(options.loadWasmBytes);
    const treeSitter = grammarLoader.createTreeSitterLanguageAnalyzer(
      "python",
      options.loadWasmBytes,
    );
    // CPython's messages are the ones worth reading; the grammar only covers
    // the window while Pyodide is still booting.
    return createWarmPreferredAnalyzer(createPythonAnalyzer(), treeSitter, {
      isReady: isPyodideRuntimeReady,
      bootstrap: warmPythonWhenIdle,
    });
  },
  shell: async (_fileType, options) => {
    const { createShellCheckAnalyzer } =
      await import("./parsers/shellcheck-analyzer");
    return createShellCheckAnalyzer(() =>
      options.loadWasmBytes(shellcheckRuntime()),
    );
  },
};

const loadLocalAnalyzer: LocalAnalyzerLoader = async (fileType, options) => {
  const nativeLanguageLoader = nativeLanguageLoaders[fileType];
  if (nativeLanguageLoader) return nativeLanguageLoader(fileType, options);
  if (isFormatFileType(fileType)) {
    const { createFormatAnalyzer } = await import("./format-analyzer");
    return createFormatAnalyzer(fileType, options.loadWasmBytes);
  }
  const { createTreeSitterLanguageAnalyzer } =
    await import("./parsers/grammar-loader");
  return createTreeSitterLanguageAnalyzer(
    fileType as TreeSitterGrammarId,
    options.loadWasmBytes,
  );
};

const nativeLanguageDebounceMs: Partial<
  Record<TreeSitterGrammarId | CodeFileType, number>
> = {
  shell: 400,
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
  options: AnalyzerLoaderOptions = {
    loadWasmBytes: loadEditorWasmBytes,
    resolveAssetLocation: resolveEditorAssetLocation,
  },
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
        options,
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
    whenPreferredReady: async () => {
      if (fileType !== "python" || disposed) return false;
      const python = await import("./parsers/python-analyzer");
      python.setPyodideRuntimeLoader(options.loadWasmBytes);
      if (python.isPyodideRuntimeReady()) return false;
      await warmPythonWhenIdle();
      return !disposed;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (localAnalyzer) disposeLocalAnalyzer(localAnalyzer);
      else
        void localAnalyzerPromise?.then(disposeLocalAnalyzer).catch(() => {});
    },
  };
};
