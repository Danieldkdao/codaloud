// Host-agnostic runtime loading: no Node or React Native imports here, and the
// reader is supplied by the caller since Metro ids and disk paths differ per host.

import type { AnalyzerWasmAsset } from "./vendored-asset";

/** Reads a vendored runtime's bytes as a plain-ArrayBuffer view, the shape
 * `new Response(...)` accepts. */
export type AnalyzerWasmLoader = (
  asset: AnalyzerWasmAsset,
) => Promise<Uint8Array<ArrayBuffer>>;

export const createNativeWasmLoader = async (): Promise<AnalyzerWasmLoader> => {
  const [{ resolveNativeAssetUrl }, { loadWasmBytes }] = await Promise.all([
    import("./native-runtime"),
    import("./wasm-instance"),
  ]);
  return async (asset) => {
    const url = resolveNativeAssetUrl(asset);
    if (!url) throw new Error("Analyzer asset unavailable");
    return loadWasmBytes(url);
  };
};
