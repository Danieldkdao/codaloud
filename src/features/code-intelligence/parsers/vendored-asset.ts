export type AnalyzerWasmAsset = number | string | undefined;

export type ResolveAssetLocation = (
  asset: AnalyzerWasmAsset,
) => Promise<string | null>;

export type AnalyzerAssetSpecifier = string;

type HostAssetResolver = (
  specifier: AnalyzerAssetSpecifier,
) => string | undefined;

let hostAssetResolver: HostAssetResolver | undefined;

export const setHostAssetResolver = (resolve: HostAssetResolver) => {
  hostAssetResolver = resolve;
};

export const resolveVendoredAsset = (
  specifier: AnalyzerAssetSpecifier,
  metroRequire: () => AnalyzerWasmAsset,
): AnalyzerWasmAsset => {
  const hosted = hostAssetResolver?.(specifier);
  if (hosted !== undefined && hosted !== null) return hosted;
  try {
    const asset = metroRequire();
    if (asset !== undefined && asset !== null) return asset;
  } catch {
    // Node has no loader for these extensions and throws. That is the expected
    // path for the worker, not a failure, so it falls through to nothing.
  }
  return undefined;
};

/** The runtimes and grammars the analyzers load, named as repository paths. */
export const analyzerAssetSpecifiers = {
  prismRuntime: "src/features/code-intelligence/parsers/runtimes/prism.wasm",
  shellcheckRuntime:
    "src/features/code-intelligence/parsers/runtimes/shellcheck.wasm",
  pyodideStdlib:
    "src/features/code-intelligence/parsers/runtimes/pyodide-stdlib.zip",
  pyodideWasm:
    "src/features/code-intelligence/parsers/runtimes/pyodide.asm.wasm",
  treeSitterRuntime: "node_modules/web-tree-sitter/web-tree-sitter.wasm",
  pythonGrammar: "src/features/code-intelligence/parsers/grammars/python.wasm",
  goGrammar: "src/features/code-intelligence/parsers/grammars/go.wasm",
  javaGrammar: "src/features/code-intelligence/parsers/grammars/java.wasm",
  cGrammar: "src/features/code-intelligence/parsers/grammars/c.wasm",
  cppGrammar: "src/features/code-intelligence/parsers/grammars/cpp.wasm",
  csharpGrammar: "src/features/code-intelligence/parsers/grammars/csharp.wasm",
  phpGrammar: "src/features/code-intelligence/parsers/grammars/php.wasm",
  rustGrammar: "src/features/code-intelligence/parsers/grammars/rust.wasm",
  rubyGrammar: "src/features/code-intelligence/parsers/grammars/ruby.wasm",
  shellGrammar: "src/features/code-intelligence/parsers/grammars/bash.wasm",
  dockerfileGrammar:
    "src/features/code-intelligence/parsers/grammars/containerfile.wasm",
} as const satisfies Record<string, AnalyzerAssetSpecifier>;
