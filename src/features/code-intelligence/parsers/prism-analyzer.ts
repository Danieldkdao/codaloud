import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import { resolveNativeAssetUrl } from "./native-runtime";
import { instantiateWasiModule, loadWasmBytes } from "./wasm-instance";
import { toPrismDiagnostics, type PrismError } from "./prism-diagnostics";

// Prism's published entry point loads the wasm through node:fs, which does not
// exist in React Native. Import the parser directly instead: it drives the same
// serializer, it only needs the instantiated exports, and it pulls in no Node
// builtins. The wasm itself is vendored alongside the other runtimes because
// the package does not expose it through its exports map.
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

const loadPrism = () => {
  prismExports ??= (async () => {
    const url = resolveNativeAssetUrl(require("./runtimes/prism.wasm"));
    if (!url) throw new Error("Prism asset unavailable");
    const instance = await instantiateWasiModule(await loadWasmBytes(url));
    return instance.exports as unknown as PrismExports;
  })();
  return prismExports;
};

export const createPrismAnalyzer = (): NativeLanguageAnalyzer => {
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
        // The cached promise is cleared unconditionally: leaving it rejected
        // would replay this same failure on every keystroke forever, and the
        // editor would report the file as having no problems rather than as
        // unavailable.
        prismExports = undefined;
        if (__DEV__)
          console.warn(
            `Prism failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
