import type { Language, Parser, Tree } from "web-tree-sitter";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { warnAnalyzerFailure } from "./analyzer-diagnostics-log";
import {
  ensureTreeSitterGlobals,
  withTreeSitterNodeDetectionDisabled,
} from "./tree-sitter-globals";
import {
  getTreeSitterDiagnostics,
  type TreeSitterLanguage,
} from "./tree-sitter-analyzer";

export type TreeSitterSources = {
  loadRuntimeBytes: () => Promise<Uint8Array>;
  loadGrammarBytes: () => Promise<Uint8Array>;
};

export type TreeSitterAnalysis = {
  status: "ready" | "unavailable";
  diagnostics: CodeDiagnosticSchema[];
};

const MAX_PARSE_DURATION_MS = 100;
let runtimeInitialization: Promise<void> | undefined;
let runtimeModule: Promise<typeof import("web-tree-sitter")> | undefined;
const grammarLanguages = new Map<string, Promise<Language>>();

// Load lazily so the process shim is installed before the Emscripten module
// evaluates. A static import would hoist above the shim and throw.
const loadRuntimeModule = () => {
  runtimeModule ??= (async () => {
    ensureTreeSitterGlobals();
    return import("web-tree-sitter");
  })();
  return runtimeModule;
};

const initializeRuntime = (loadRuntimeBytes: () => Promise<Uint8Array>) => {
  runtimeInitialization ??= (async () => {
    const { Parser } = await loadRuntimeModule();
    const wasmBinary = await loadRuntimeBytes();
    await withTreeSitterNodeDetectionDisabled(() =>
      Parser.init({
        wasmBinary,
      } as unknown as Parameters<typeof Parser.init>[0]),
    );
  })();
  return runtimeInitialization;
};

const loadGrammarLanguage = (
  grammarId: string,
  loadGrammarBytes: () => Promise<Uint8Array>,
) => {
  let languagePromise = grammarLanguages.get(grammarId);
  if (!languagePromise) {
    languagePromise = (async () => {
      const { Language } = await loadRuntimeModule();
      return Language.load(await loadGrammarBytes());
    })();
    grammarLanguages.set(grammarId, languagePromise);
    void languagePromise.catch(() => {
      if (grammarLanguages.get(grammarId) === languagePromise)
        grammarLanguages.delete(grammarId);
    });
  }
  return languagePromise;
};

export const createTreeSitterAnalyzer = (
  language: TreeSitterLanguage,
  sources: TreeSitterSources,
) => {
  let parser: Parser | undefined;
  let initialization: Promise<void> | undefined;
  let disposed = false;

  const initialize = () => {
    initialization ??= (async () => {
      await initializeRuntime(sources.loadRuntimeBytes);
      const grammar = await loadGrammarLanguage(
        language.id,
        sources.loadGrammarBytes,
      );
      if (disposed) return;
      const { Parser } = await loadRuntimeModule();
      parser = new Parser();
      parser.setLanguage(grammar);
    })();
    return initialization;
  };

  const analyze = async (content: string): Promise<TreeSitterAnalysis> => {
    if (
      disposed ||
      new TextEncoder().encode(content).length > MAX_PROJECT_FILE_SIZE_BYTES
    )
      return { status: "unavailable", diagnostics: [] };

    let tree: Tree | null = null;
    try {
      await initialize();
      if (disposed || !parser)
        return { status: "unavailable", diagnostics: [] };

      const parseStartedAt = Date.now();
      let exceededTimeLimit = false;
      tree = parser.parse(content, undefined, {
        progressCallback: (progress) => {
          exceededTimeLimit =
            Date.now() - parseStartedAt > MAX_PARSE_DURATION_MS;
          return (
            exceededTimeLimit ||
            progress.currentOffset > MAX_PROJECT_FILE_SIZE_BYTES
          );
        },
      });
      if (!tree || exceededTimeLimit)
        return { status: "unavailable", diagnostics: [] };

      return {
        status: "ready",
        diagnostics: getTreeSitterDiagnostics(content, tree.rootNode, language),
      };
    } catch (error) {
      // The error name alone does not say whether the wasm fetch or the parse
      // broke, so the message and resolved asset URLs are logged together.
      warnAnalyzerFailure(
        `Tree-sitter failed for ${language.id}: ${
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "unknown error"
        }`,
      );
      return { status: "unavailable", diagnostics: [] };
    } finally {
      tree?.delete();
    }
  };

  return {
    analyze,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      parser?.delete();
      parser = undefined;
    },
  };
};
