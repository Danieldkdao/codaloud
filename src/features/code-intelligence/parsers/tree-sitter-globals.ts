// The Emscripten runtime inside web-tree-sitter probes process.versions.node to
// decide whether it is running under Node. React Native's process polyfill has
// no versions object, so that read throws a TypeError before any wasm loads.
//
// Provide an empty versions object. Deliberately leave versions.node undefined:
// setting it would make Emscripten believe it is under Node and take its
// require("fs") code path, which does not exist in a WebView.
export const ensureTreeSitterGlobals = () => {
  const scope = globalThis as {
    process?: { versions?: Record<string, string> };
  };
  if (!scope.process) scope.process = {};
  if (!scope.process.versions) scope.process.versions = {};
};
