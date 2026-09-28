import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyzerWasmLoader } from "@/features/code-intelligence/analyzer-registry";
import {
  setHostAssetResolver,
  type AnalyzerAssetSpecifier,
  type ResolveAssetLocation,
} from "@/features/code-intelligence/parsers/vendored-asset";

/** Reads a vendored runtime from disk; the only place the analyzers may name a
 * Node builtin, since modules the app bundles must stay loadable in Hermes. */
export const loadWorkerWasmBytes: AnalyzerWasmLoader = async (asset) => {
  if (typeof asset !== "string")
    throw new Error("Analyzer asset unavailable in the worker.");
  return new Uint8Array(await readFile(asset));
};

const projectRoot = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Points the shared analyzers at their vendored files; the worker has no
 * bundler and Node's loader cannot read `.wasm`/`.zip`, so without it all fail. */
export const registerWorkerAssetResolver = () => {
  setHostAssetResolver((specifier: AnalyzerAssetSpecifier) =>
    resolvePath(projectRoot, specifier),
  );
};

/** tree-sitter reads its runtime and grammar from this path directly and takes
 * a filesystem path as readily as a url, so no `file:` conversion is needed. */
export const resolveWorkerAssetLocation: ResolveAssetLocation = async (
  asset,
) => (typeof asset === "string" ? asset : null);

// Registered on import so every entry point into the worker gets it, including
// the tests and the health endpoint, not only `cli.runApp`.
registerWorkerAssetResolver();
