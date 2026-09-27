import { Image } from "react-native";
import { treeSitterGrammars, type TreeSitterGrammarId } from "./grammars";
import { createTreeSitterAnalyzer } from "./tree-sitter-runtime";

// Resolve a bundled asset to a URL the wasm runtime can fetch. Expo's own DOM
// base URL is not readable from the React Native side, so use the React Native
// asset resolver, which returns a dev-server URL in development and a local
// asset path in release. Returns null when the asset cannot be resolved so the
// analyzer degrades to "unavailable" instead of throwing while the module loads.
const resolveWasmAsset = (asset: number | string): string | null => {
  if (typeof asset === "string") return asset;
  try {
    return Image.resolveAssetSource(asset)?.uri ?? null;
  } catch {
    return null;
  }
};

const grammarAssets: Record<TreeSitterGrammarId, number | string> = {
  python: require("./grammars/python.wasm"),
  java: require("./grammars/java.wasm"),
  c: require("./grammars/c.wasm"),
  cpp: require("./grammars/cpp.wasm"),
  csharp: require("./grammars/csharp.wasm"),
  go: require("./grammars/go.wasm"),
  php: require("./grammars/php.wasm"),
  rust: require("./grammars/rust.wasm"),
  ruby: require("./grammars/ruby.wasm"),
  shell: require("./grammars/bash.wasm"),
  dockerfile: require("./grammars/containerfile.wasm"),
};

// web-tree-sitter uses FinalizationRegistry for lookaheads, but catches its
// absence internally, so a missing registry only costs that convenience.
const unavailableWasmUrl = "unavailable.wasm";

export const createTreeSitterLanguageAnalyzer = (
  grammarId: TreeSitterGrammarId,
) => {
  const runtimeWasmUrl =
    resolveWasmAsset(require("web-tree-sitter/web-tree-sitter.wasm")) ??
    unavailableWasmUrl;
  const wasmUrl =
    resolveWasmAsset(grammarAssets[grammarId]) ?? unavailableWasmUrl;
  return createTreeSitterAnalyzer(
    {
      ...treeSitterGrammars[grammarId],
      wasmUrl,
    },
    runtimeWasmUrl,
  );
};
