import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AnalyzerLoaderOptions } from "@/features/code-intelligence/analyzer-registry";
import {
  analyzerAssetSpecifiers,
  setHostAssetResolver,
  type AnalyzerAssetSpecifier,
  type ResolveAssetLocation,
} from "@/features/code-intelligence/parsers/vendored-asset";

const runtimeDirectory = "src/features/code-intelligence/parsers/runtimes";
const marker = "pyodide.asm.wasm";

const starts = () => {
  const candidates = [process.cwd()];
  // Metro emits CommonJS for API routes, so the bundle has a real __dirname.
  if (typeof __dirname === "string") candidates.push(__dirname);
  return candidates;
};

const containsRuntimes = (directory: string) =>
  existsSync(join(resolve(directory), runtimeDirectory, marker));

let projectRoot: string | undefined;
let rootSearched = false;

const findProjectRoot = () => {
  if (rootSearched) return projectRoot;
  rootSearched = true;
  for (const start of starts()) {
    let current = resolve(start);
    for (;;) {
      if (containsRuntimes(current)) {
        projectRoot = current;
        return current;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return undefined;
};

/** Reads a vendored runtime's bytes for the analyzers to instantiate. */
export const loadServerWasmBytes = async (
  asset: string | number | undefined,
) => {
  if (typeof asset !== "string")
    throw new Error("Analyzer asset unavailable in the server route.");
  return new Uint8Array(await readFile(asset));
};

/** tree-sitter reads its runtime and grammar from this location directly and
 * accepts a filesystem path as readily as a url. */
export const resolveServerAssetLocation: ResolveAssetLocation = async (
  asset,
) => (typeof asset === "string" ? asset : null);

/** Without this every wasm-backed analyzer reports "unavailable" and the agent
 * has no diagnostics to offer, which is the failure this route exists to fix. */
export const registerServerAssetResolver = () => {
  setHostAssetResolver((specifier: AnalyzerAssetSpecifier) => {
    const root = findProjectRoot();
    if (!root) return undefined;
    return join(root, specifier);
  });
};

/** The loaders the shared analyzer registry needs outside a bundler. */
export const serverAnalyzerOptions = (): AnalyzerLoaderOptions => {
  registerServerAssetResolver();
  return {
    loadWasmBytes: loadServerWasmBytes,
    resolveAssetLocation: resolveServerAssetLocation,
  };
};

export { analyzerAssetSpecifiers };
