import { treeSitterGrammars, type TreeSitterGrammarId } from "./grammars";
import { createTreeSitterAnalyzer } from "./tree-sitter-runtime";

const resolveDomAsset = (assetPath: string) => {
  // Expo injects the asset base into the embedded DOM; shared server/client env modules are unavailable here.
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) throw new Error("Expo DOM asset base URL is unavailable.");
  return new URL(assetPath, baseUrl).toString();
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

const runtimeWasmUrl = resolveDomAsset(
  String(require("web-tree-sitter/web-tree-sitter.wasm")),
);

export const createTreeSitterLanguageAnalyzer = (
  grammarId: TreeSitterGrammarId,
) =>
  createTreeSitterAnalyzer(
    {
      ...treeSitterGrammars[grammarId],
      wasmUrl: resolveDomAsset(String(grammarAssets[grammarId])),
    },
    runtimeWasmUrl,
  );
