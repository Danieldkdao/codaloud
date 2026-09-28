import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import {
  PYTHON_CHECK_EXPRESSION,
  PYTHON_CHECK_INSTALL_SOURCE,
  parsePythonCheckResult,
  toPythonDiagnostics,
} from "./python-diagnostics";
import { warnAnalyzerFailure } from "./analyzer-diagnostics-log";
import { withTreeSitterNodeDetectionDisabled } from "./tree-sitter-globals";
import type { AnalyzerWasmLoader } from "./analyzer-asset-url";
import type { AnalyzerWasmAsset } from "./vendored-asset";
import {
  analyzerAssetSpecifiers,
  resolveVendoredAsset,
} from "./vendored-asset";
// The package lock file is JSON, so Metro bundles it as a module instead of an
// asset. Importing it directly avoids treating the parsed object as an asset id.
import pyodideLockFile from "./runtimes/pyodide-lock.json";

type Pyodide = {
  version: string;
  runPython: (code: string) => unknown;
  globals: { set: (name: string, value: unknown) => void };
  setStdout: (handler: (text: string) => void) => void;
};

type PyodideModuleFactory = (settings: unknown) => Promise<unknown>;

// Pyodide validates the lock file it is given against its own runtime, so pass
// the real type through rather than a hand-written approximation.
type Lockfile = import("pyodide").Lockfile;

// The vendored build's Node bindings are stripped, so every host boots Pyodide
// through its browser branch; these globals satisfy it and are removed after boot.
const installPyodideEnvironmentShims = () => {
  const scope = globalThis as Record<string, unknown>;
  const noop = () => {};
  const created: string[] = [];
  const define = (key: string, value: unknown) => {
    if (typeof scope[key] !== "undefined") return;
    scope[key] = value;
    created.push(key);
  };
  define("window", globalThis);
  define("self", globalThis);
  define("document", { createElement: () => ({}) });
  // Pyodide resolves the standard library with `new URL(stdLibURL, location)`,
  // so it needs a real absolute base to join against.
  define("location", { toString: () => "http://localhost/" });
  define("sessionStorage", {});
  // The Emscripten module registers listeners on the global object during boot.
  define("addEventListener", noop);
  define("removeEventListener", noop);
  // React Native and Metro's web bundle expose a `process` with no `versions`;
  // give it an empty one so Pyodide reads a missing Node version, not a throw.
  const processScope = scope.process as
    | { versions?: Record<string, string> }
    | undefined;
  if (processScope && !processScope.versions) processScope.versions = {};
  return () => {
    for (const key of created) delete scope[key];
  };
};

// The bytes are read through the host's loader; the locations are kept so each
// host can be handed the form its own binary loader expects.
type PyodideRuntimeBytes = {
  stdLib: Uint8Array<ArrayBuffer>;
  wasm: Uint8Array<ArrayBuffer>;
  stdLibLocation: AnalyzerWasmAsset;
  wasmLocation: AnalyzerWasmAsset;
};

let loadRuntimeBytes: AnalyzerWasmLoader | undefined;

// Resolved once and reported on failure, so a broken asset path is visible in
// development rather than surfacing as a null dereference inside the runtime.
let runtimeBytes: PyodideRuntimeBytes | undefined;

export const setPyodideRuntimeLoader = (load: AnalyzerWasmLoader) => {
  if (runtimeBytes) return;
  loadRuntimeBytes = load;
};

const loadPyodideRuntimeBytes = async () => {
  if (runtimeBytes) return runtimeBytes;
  if (!loadRuntimeBytes)
    throw new Error("Pyodide has no runtime loader for this host.");
  // The literal requires stay for Metro. Node has no loader for `.zip` or
  // `.wasm` and throws, so the wrapper falls back to the worker's path resolver.
  const stdLibLocation = resolveVendoredAsset(
    analyzerAssetSpecifiers.pyodideStdlib,
    () => require("./runtimes/pyodide-stdlib.zip"),
  );
  const wasmLocation = resolveVendoredAsset(
    analyzerAssetSpecifiers.pyodideWasm,
    () => require("./runtimes/pyodide.asm.wasm"),
  );
  const [stdLib, wasm] = await Promise.all([
    loadRuntimeBytes(stdLibLocation),
    loadRuntimeBytes(wasmLocation),
  ]);
  runtimeBytes = { stdLib, wasm, stdLibLocation, wasmLocation };
  return runtimeBytes;
};

/** Synthetic absolute urls: joinable, and carrying the names the fetch override
 * below matches; a real path or "/" base would make `new URL` throw. */
const pyodideAssetUrls = () => ({
  indexURL: "https://pyodide.invalid/",
  stdLibURL: "https://pyodide.invalid/python_stdlib.zip",
});

// Answer Pyodide's runtime fetches from the bytes already in hand, so its own
// url handling (which cannot read a `file:` url in the worker) never applies.
const withPyodideAssets = async <T>(
  assets: PyodideRuntimeBytes,
  run: () => Promise<T>,
): Promise<T> => {
  const originalFetch = globalThis.fetch;
  const stdLibBytes = Promise.resolve(assets.stdLib);
  const wasmBytes = Promise.resolve(assets.wasm);
  const isPyodideRequest = (url: string) =>
    url.includes("python_stdlib.zip") ||
    url.includes("pyodide-stdlib") ||
    url.includes("pyodide.asm.wasm");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (!isPyodideRequest(url)) return originalFetch(input, init);
    // instantiateStreaming requires a wasm content type on the response.
    if (url.includes(".wasm"))
      return new Response(await wasmBytes, {
        status: 200,
        headers: { "content-type": "application/wasm" },
      });
    return new Response(await stdLibBytes, { status: 200 });
  }) as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

let pyodideInstance: Promise<Pyodide> | undefined;
let pyodideReady = false;

/** Whether the interpreter is booted: a warm compile is milliseconds, a cold
 * boot seconds, so callers use a faster engine until this flips. */
export const isPyodideRuntimeReady = () => pyodideReady;

/** Boots ahead of the next analysis; not tied to any analyzer instance, so a
 * boot paid for by one request survives a host that disposes per request. */
export const warmPyodideRuntime = () => loadPyodide().then(() => {});

const loadPyodide = () => {
  pyodideInstance ??= (async () => {
    // The lock file is JSON, so Metro inlines it as a module; the binaries are
    // read through the host's loader and do not touch environment detection.
    const assets = await loadPyodideRuntimeBytes();
    // A missing stdlib only surfaces as a console.error during boot, so this is
    // the earliest point the failure can be detected and reported usefully.
    const assertRuntimeReady = (instance: Pyodide) => {
      if (!instance.runPython || !instance.globals)
        throw new Error("Pyodide booted without a Python runtime");
      return instance;
    };
    // The lock file is a generated artifact with a stable top-level shape.
    const lockFileContents = pyodideLockFile as unknown as Lockfile;

    // Boot through the browser branch: hide the Node version while the runtime
    // module and Emscripten factory evaluate, and undo both once booted.
    const ready = await withTreeSitterNodeDetectionDisabled(async () => {
      const restoreShims = installPyodideEnvironmentShims();
      try {
        // Metro cannot dynamic-import a url, so the Emscripten module is
        // imported statically and handed to the loader as a factory.
        const asmModule = (
          (await import("pyodide/pyodide.asm.mjs")) as {
            default: PyodideModuleFactory;
          }
        ).default;

        const { loadPyodide: createPyodide } = await import("pyodide");
        const urls = pyodideAssetUrls();
        const pyodide = (await withPyodideAssets(assets, () =>
          createPyodide({
            // Synthetic absolute urls; the fetch override answers both.
            ...urls,
            lockFileContents,
            // Skipping the check also stops Pyodide replacing locateFile with
            // one that throws, which would break the override.
            checkAPIVersion: false,
            createPyodideModule: (settings) => {
              // Keep Pyodide's own instantiateWasm: it injects the Jsv error
              // imports and reaches the bytes via instantiateStreaming.
              const { instantiateWasm, ...rest } = settings as unknown as {
                instantiateWasm?: (
                  imports: WebAssembly.Imports,
                  receiveInstance: (
                    instance: WebAssembly.Instance,
                    module: WebAssembly.Module,
                  ) => void,
                ) => { then: (onDone: (exports: unknown) => void) => void };
              };
              return asmModule({
                ...rest,
                instantiateWasm,
              }) as never;
            },
          }),
        )) as unknown as Pyodide;

        // Silence output and let the app own diagnostics.
        pyodide.setStdout(() => {});
        pyodide.runPython(PYTHON_CHECK_INSTALL_SOURCE);
        return assertRuntimeReady(pyodide);
      } finally {
        restoreShims();
      }
    });
    pyodideReady = true;
    return ready;
  })();
  return pyodideInstance;
};

export const createPythonAnalyzer = (): NativeLanguageAnalyzer => {
  let disposed = false;
  return {
    analyze: async (content): Promise<NativeLanguageAnalysis> => {
      if (disposed || !isAnalyzableContent(content))
        return { status: "unavailable", diagnostics: [] };
      try {
        const pyodide = await loadPyodide();
        if (disposed) return { status: "unavailable", diagnostics: [] };
        pyodide.globals.set("source", content);
        const check = parsePythonCheckResult(
          pyodide.runPython(PYTHON_CHECK_EXPRESSION),
        );
        return {
          status: "ready",
          diagnostics: toPythonDiagnostics(content, check),
        };
      } catch (error) {
        // Clear the cached promise so a boot failure is not replayed on every
        // keystroke; rejections here are not always Error instances.
        pyodideInstance = undefined;
        pyodideReady = false;
        warnAnalyzerFailure("Pyodide failed", error);
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
