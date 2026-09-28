import { treeSitterGrammars, type TreeSitterGrammarId } from "./grammars";
import { createTreeSitterAnalyzer } from "./tree-sitter-runtime";
import {
  analyzerAssetSpecifiers,
  resolveVendoredAsset,
  type AnalyzerAssetSpecifier,
  type AnalyzerWasmAsset,
} from "./vendored-asset";
import type { AnalyzerWasmLoader } from "./analyzer-asset-url";

// Imported by the Node worker too, so it may not import React Native or name a
// wasm file directly; the caller resolves both through the loader.

const grammarAssets: Record<TreeSitterGrammarId, AnalyzerAssetSpecifier> = {
  python: analyzerAssetSpecifiers.pythonGrammar,
  java: analyzerAssetSpecifiers.javaGrammar,
  c: analyzerAssetSpecifiers.cGrammar,
  cpp: analyzerAssetSpecifiers.cppGrammar,
  csharp: analyzerAssetSpecifiers.csharpGrammar,
  go: analyzerAssetSpecifiers.goGrammar,
  php: analyzerAssetSpecifiers.phpGrammar,
  rust: analyzerAssetSpecifiers.rustGrammar,
  ruby: analyzerAssetSpecifiers.rubyGrammar,
  shell: analyzerAssetSpecifiers.shellGrammar,
  dockerfile: analyzerAssetSpecifiers.dockerfileGrammar,
};

// Each literal require is written out because Metro only bundles an asset it
// can see named in a literal argument; Node falls back to the host resolver.
const metroGrammarAssets: Record<TreeSitterGrammarId, () => AnalyzerWasmAsset> =
  {
    python: () => require("./grammars/python.wasm"),
    java: () => require("./grammars/java.wasm"),
    c: () => require("./grammars/c.wasm"),
    cpp: () => require("./grammars/cpp.wasm"),
    csharp: () => require("./grammars/csharp.wasm"),
    go: () => require("./grammars/go.wasm"),
    php: () => require("./grammars/php.wasm"),
    rust: () => require("./grammars/rust.wasm"),
    ruby: () => require("./grammars/ruby.wasm"),
    shell: () => require("./grammars/bash.wasm"),
    dockerfile: () => require("./grammars/containerfile.wasm"),
  };

const metroTreeSitterRuntime = () =>
  resolveVendoredAsset(analyzerAssetSpecifiers.treeSitterRuntime, () =>
    require("web-tree-sitter/web-tree-sitter.wasm"),
  );

/** Resolves the runtime and grammar to whatever this host calls an asset, then
 * reads them as bytes so one module serves WebView, worker and server route. */
export const createTreeSitterLanguageAnalyzer = (
  grammarId: TreeSitterGrammarId,
  loadWasmBytes: AnalyzerWasmLoader,
) => {
  const runtimeAsset = metroTreeSitterRuntime();
  const grammarAsset = resolveVendoredAsset(
    grammarAssets[grammarId],
    metroGrammarAssets[grammarId],
  );

  return createTreeSitterAnalyzer(treeSitterGrammars[grammarId], {
    loadRuntimeBytes: () => loadWasmBytes(runtimeAsset),
    loadGrammarBytes: () => loadWasmBytes(grammarAsset),
  });
};
