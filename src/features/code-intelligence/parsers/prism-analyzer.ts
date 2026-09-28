import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import { instantiateWasiModule } from "./wasm-instance";
import { warnAnalyzerFailure } from "./analyzer-diagnostics-log";
import { toPrismDiagnostics, type PrismError } from "./prism-diagnostics";

// Prism's published entry point loads its wasm through node:fs, which React Native
// lacks, so the parser is imported directly and the wasm vendored like the others.
type ParsePrism = (
  exports: Record<string, unknown>,
  source: string,
  options: Record<string, unknown>,
) => { errors: PrismError[]; warnings: PrismError[] };

type PrismExports = Parameters<ParsePrism>[0];

type PrismModule = { parsePrism: ParsePrism };

const importPrismModule = () =>
  import("@ruby/prism/src/parsePrism.js") as Promise<PrismModule>;

let prismExports: Promise<PrismExports> | undefined;

// The cached instance is dropped when the host loader changes, so a reader
// supplied for the worker can never be reused by the editor.
let prismLoad: PrismLoader | undefined;

type PrismLoader = () => Promise<Uint8Array>;

const loadPrism = () => {
  prismExports ??= (async () => {
    if (!prismLoad)
      throw new Error("Prism has no runtime loader for this host.");
    const instance = await instantiateWasiModule(await prismLoad());
    return instance.exports as unknown as PrismExports;
  })();
  return prismExports;
};

export const createPrismAnalyzer = (
  loadBytes: PrismLoader,
): NativeLanguageAnalyzer => {
  if (prismLoad !== loadBytes) {
    prismLoad = loadBytes;
    prismExports = undefined;
  }
  let disposed = false;
  return {
    analyze: async (content): Promise<NativeLanguageAnalysis> => {
      if (disposed || !isAnalyzableContent(content))
        return { status: "unavailable", diagnostics: [] };
      try {
        const { parsePrism } = await importPrismModule();
        const exports = await loadPrism();
        if (disposed) return { status: "unavailable", diagnostics: [] };
        const result = parsePrism(exports, content, {});
        return {
          status: "ready",
          diagnostics: toPrismDiagnostics(content, [
            ...result.errors,
            ...result.warnings,
          ]),
        };
      } catch (error) {
        // A rejected cached promise would replay this failure on every keystroke
        // forever, so it is cleared unconditionally.
        prismExports = undefined;
        warnAnalyzerFailure("Prism failed", error);
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
