import shellCheckGlue from "./shellcheck-js-ffi-glue";
import { instantiateWasiModule } from "./wasm-instance";

type ShellCheckExports = {
  memory: WebAssembly.Memory;
  hs_init: (argc: number, argv: number) => void;
  lintWithOptions: (
    script: string,
    options: string,
  ) => Promise<string> | string;
};

export type ShellCheckSession = {
  lint: (script: string) => Promise<string>;
};

// Build one ShellCheck session from a module's bytes.
//
// A session is deliberately not reusable. ShellCheck is a Haskell program
// compiled to WebAssembly, and its runtime degrades after a number of lint
// calls that hit a parser error: it starts trapping with "Unreachable code",
// "Out of bounds call_indirect" and "Out of bounds memory access", and every
// later call on that instance fails the same way. The exact number of calls
// before it gives out varies with the input, so an instance cannot be trusted
// for any fixed reuse budget. Rebuilding from bytes that are already in memory
// costs tens of milliseconds, which is why the bytes are cached by the caller
// and the instance is not.
export const createShellCheckSession = async (
  bytes: Uint8Array,
): Promise<ShellCheckSession> => {
  // The glue module is a factory: it is called with the wasm exports so it can
  // wire up the callbacks the Haskell side imports.
  const jsffiWasmImports: Record<string, unknown> = {};
  const jsffi = shellCheckGlue(jsffiWasmImports) as Record<string, unknown>;
  const instance = await instantiateWasiModule(bytes, {
    ghc_wasm_jsffi: jsffi,
  });
  // The glue needs the instantiated exports to finish binding them.
  Object.assign(jsffiWasmImports, instance.exports);
  const exports = instance.exports as unknown as ShellCheckExports;
  exports.hs_init(0, 0);
  return {
    // The runtime hands back a string synchronously in some builds and a promise
    // in others, so the session always normalises to a promise.
    lint: async (script: string) =>
      exports.lintWithOptions(
        script,
        JSON.stringify({ shell: "bash", severity: "info" }),
      ),
  };
};
