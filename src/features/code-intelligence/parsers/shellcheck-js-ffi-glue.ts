// JavaScript runtime glue for the ShellCheck Haskell/Wasm build, vendored from
// shellcheck-wasm@0.3.3 (dist/shellcheck.js).
//
// The published package does not export this file, and its browser entry loads
// it with a dynamic import of a URL, which Metro cannot resolve. It is a
// generated file that changes only with a ShellCheck release, so it is copied
// in rather than reached through a bundler workaround. Upstream:
// https://www.npmjs.com/package/shellcheck-wasm (GPL-3.0-or-later)
//
// The default export is a factory taking the wasm exports, returning the import
// object the module declares under "ghc_wasm_jsffi". The wasm imports these
// under GHC-mangled names whose argument types vary per callback, so the glue
// stays untyped internally; it is generated code that mirrors the binary.
type ShellCheckJsFfiGlue = (exports: Record<string, unknown>) => Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]) => unknown
>;

// Manage a mapping from 32-bit ids to actual JavaScript values.
class JSValManager {
  #lastk = 0;
  #kv = new Map<number, unknown>();

  newJSVal(v: unknown) {
    const k = ++this.#lastk;
    this.#kv.set(k, v);
    return k;
  }

  // A separate has() call to ensure we can store undefined as a value too, and
  // check unconditionally: a false positive costs a throw, while a false
  // negative is a use-after-free to be fixed.
  getJSVal(k: number) {
    if (!this.#kv.has(k)) {
      throw new WebAssembly.RuntimeError(`getJSVal(${k})`);
    }
    return this.#kv.get(k);
  }

  // Check for double free as well.
  freeJSVal(k: number) {
    if (!this.#kv.delete(k)) {
      throw new WebAssembly.RuntimeError(`freeJSVal(${k})`);
    }
  }
}

// The setImmediate implementation to use. Kept as a module scope binding so it
// does not pollute globalThis. React Native has no scheduler or MessageChannel,
// so the setTimeout path is the one that runs.
const setImmediateShim: (callback: () => void) => unknown = (() => {
  if (globalThis.setImmediate) {
    return globalThis.setImmediate;
  }
  return (callback: () => void) => setTimeout(callback, 0);
})();

// The Haskell runtime passes its own marshalled values in, so each callback
// narrows the arguments it understands.
type ExportResolver = {
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  throwTo?: (error: unknown) => void;
};

// A promise the runtime drives itself: the Haskell side resolves and rejects it
// through the callbacks above rather than through the executor.
type SettleablePromise = Promise<unknown> & {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

const shellCheckJsFfiGlue: ShellCheckJsFfiGlue = (__exports) => {
  const __ghc_wasm_jsffi_jsval_manager = new JSValManager();
  // Hermes has no FinalizationRegistry, so stable-pointer registration is a
  // no-op. That only skips an optimisation, it does not change behaviour.
  // The registry keys on objects, while the runtime hands out numeric handles,
  // so each handle is wrapped to satisfy the key type.
  const __ghc_wasm_jsffi_finalization_registry = globalThis.FinalizationRegistry
    ? new FinalizationRegistry<{ handle: number }>(({ handle }) =>
        (__exports.rts_freeStablePtr as (pointer: number) => void)(handle),
      )
    : { register: () => {}, unregister: () => true };
  // The wasm memory is assigned by the loader immediately after instantiation.
  const memory = () => (__exports.memory as WebAssembly.Memory).buffer;
  return {
    newJSVal: (v) => __ghc_wasm_jsffi_jsval_manager.newJSVal(v),
    getJSVal: (k) => __ghc_wasm_jsffi_jsval_manager.getJSVal(k),
    freeJSVal: (k) => __ghc_wasm_jsffi_jsval_manager.freeJSVal(k),
    scheduleWork: () =>
      setImmediateShim(__exports.rts_schedulerLoop as () => void),
    ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: (
      $1: ExportResolver,
      $2: unknown,
    ) => $1.reject(new WebAssembly.RuntimeError(String($2))),
    ZC18ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: (
      $1: ExportResolver,
      $2: unknown,
    ) => $1.resolve($2),
    ZC20ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: (
      $1: ExportResolver,
    ) => {
      $1.throwTo = () => {};
    },
    ZC21ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: (
      $1: ExportResolver,
      $2: unknown,
    ) => {
      $1.throwTo = (err) =>
        (__exports.rts_promiseThrowTo as (a: unknown, b: unknown) => void)(
          $2,
          err,
        );
    },
    ZC22ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: () => {
      let res: ((value: unknown) => void) | undefined;
      let rej: ((error: unknown) => void) | undefined;
      const p = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
      }) as SettleablePromise;
      p.resolve = res!;
      p.reject = rej!;
      return p;
    },
    ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1: {
      stack?: unknown;
    }) => `${$1.stack ? $1.stack : $1}`,
    ZC1ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: (
      $1: number,
      $2: number,
    ) =>
      new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(memory(), $1, $2),
      ),
    ZC2ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: (
      $1: string,
      $2: number,
      $3: number,
    ) =>
      new TextEncoder().encodeInto($1, new Uint8Array(memory(), $2, $3))
        .written,
    ZC3ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1: {
      length: number;
    }) => $1.length,
    ZC4ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1: number) => {
      try {
        __ghc_wasm_jsffi_finalization_registry.unregister({ handle: $1 });
      } catch {
        // Unregistering an unknown pointer is not an error worth surfacing.
      }
    },
    ZC18ZCghczminternalZCGHCziInternalziWasmziPrimziImportsZC: (
      $1: Promise<unknown>,
      $2: unknown,
    ) =>
      $1.then(
        () =>
          (__exports.rts_promiseResolveUnit as (value: unknown) => void)($2),
        (err: unknown) =>
          (__exports.rts_promiseReject as (a: unknown, b: unknown) => void)(
            $2,
            err,
          ),
      ),
    ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziConcziInternalZC: async (
      $1: number,
    ) => new Promise((res) => setTimeout(res, $1 / 1000)),
  };
};

export default shellCheckJsFfiGlue;
