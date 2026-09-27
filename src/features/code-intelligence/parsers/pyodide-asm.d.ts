// Ambient declaration for Pyodide's Emscripten module. The package ships no
// types for this entry, and it is reached here only to hand the factory to
// loadPyodide, which expects the module object it returns.
declare module "pyodide/pyodide.asm.mjs" {
  const module: (settings: unknown) => Promise<unknown>;
  export default module;
}
