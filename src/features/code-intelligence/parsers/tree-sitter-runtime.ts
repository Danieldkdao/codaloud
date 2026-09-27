import type { Language, Parser, Tree } from "web-tree-sitter";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { ensureTreeSitterGlobals } from "./tree-sitter-globals";
import {
  getTreeSitterDiagnostics,
  type TreeSitterLanguage,
} from "./tree-sitter-analyzer";

export type TreeSitterGrammar = TreeSitterLanguage & {
  wasmUrl: string;
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

const initializeRuntime = (runtimeWasmUrl: string) => {
  runtimeInitialization ??= loadRuntimeModule().then(({ Parser }) =>
    Parser.init({ locateFile: () => runtimeWasmUrl }),
  );
  return runtimeInitialization;
};

const loadGrammarLanguage = (wasmUrl: string) => {
  let languagePromise = grammarLanguages.get(wasmUrl);
  if (!languagePromise) {
    languagePromise = loadRuntimeModule().then(({ Language }) =>
      Language.load(wasmUrl),
    );
    grammarLanguages.set(wasmUrl, languagePromise);
    void languagePromise.catch(() => {
      if (grammarLanguages.get(wasmUrl) === languagePromise)
        grammarLanguages.delete(wasmUrl);
    });
  }
  return languagePromise;
};

export const createTreeSitterAnalyzer = (
  grammar: TreeSitterGrammar,
  runtimeWasmUrl: string,
) => {
  let parser: Parser | undefined;
  let initialization: Promise<void> | undefined;
  let disposed = false;

  const initialize = () => {
    initialization ??= (async () => {
      await initializeRuntime(runtimeWasmUrl);
      const language = await loadGrammarLanguage(grammar.wasmUrl);
      if (disposed) return;
      const { Parser } = await loadRuntimeModule();
      parser = new Parser();
      parser.setLanguage(language);
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
        diagnostics: getTreeSitterDiagnostics(content, tree.rootNode, grammar),
      };
    } catch (error) {
      // Log the message and the resolved asset URLs. The failure name alone
      // ("TypeError") does not identify whether the wasm fetch or the parse
      // broke, and these are development-only diagnostics.
      if (__DEV__)
        console.warn(
          `Tree-sitter failed for ${grammar.id}: ${
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : "unknown error"
          }`,
          { runtimeWasmUrl, grammarWasmUrl: grammar.wasmUrl },
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
