import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import { resolveNativeAssetUrl } from "./native-runtime";
import {
  PYTHON_CHECK_EXPRESSION,
  PYTHON_CHECK_INSTALL_SOURCE,
  parsePythonCheckResult,
  toPythonDiagnostics,
} from "./python-diagnostics";
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

// Pyodide is built for the browser and refuses to start unless it can identify
// a runtime environment. The editor runs inside a DOM WebView, which already
// provides window, document, and location, while the non-DOM paths provide
// none of them. Provide only what is missing, so the browser main-thread branch
// is selected in both cases.
const installPyodideEnvironmentShims = () => {
  const scope = globalThis as Record<string, unknown>;
  const noop = () => {};
  if (typeof scope.window === "undefined") scope.window = globalThis;
  if (typeof scope.document === "undefined")
    scope.document = { createElement: () => ({}) };
  // Pyodide resolves the standard library with `new URL(stdLibURL, location)`.
  // A relative or non-absolute value would be joined onto this, so it needs a
  // real absolute base. Metro's asset URLs are already absolute, so this is only
  // reached when nothing else provides a location.
  if (typeof scope.location === "undefined")
    scope.location = { toString: () => "http://localhost/" };
  if (typeof scope.sessionStorage === "undefined") scope.sessionStorage = {};
  // The Emscripten module registers listeners on the global object during boot.
  if (typeof scope.addEventListener === "undefined")
    scope.addEventListener = noop;
  if (typeof scope.removeEventListener === "undefined")
    scope.removeEventListener = noop;
  // Pyodide's own detection reads process.versions.node to decide it is not
  // running under Node. React Native's process polyfill has no versions, so
  // leave it as an empty object rather than claiming a Node version, which
  // would send it down a filesystem path that does not exist.
  const processScope = scope.process as
    { versions?: Record<string, string> } | undefined;
  if (processScope && !processScope.versions) processScope.versions = {};
};

// Pyodide resolves a url as `new URL(value, location)` before fetching it.
// A resolved React Native asset url is already absolute, so this only guards the
// non-DOM paths where location may be a stub and the value needs a real base.
const toAbsoluteUrl = (url: string) => {
  try {
    return new URL(url, String(globalThis.location)).toString();
  } catch {
    return url;
  }
};

// Resolved once and reported on failure, so a broken asset path is visible in
// development rather than surfacing as a null dereference inside the runtime.
let assetUrls: { stdLib: string; wasm: string } | undefined;

const resolvePyodideAssetUrls = () => {
  assetUrls ??= (() => {
    const stdLib = resolveNativeAssetUrl(
      require("./runtimes/pyodide-stdlib.zip"),
    );
    const wasm = resolveNativeAssetUrl(require("./runtimes/pyodide.asm.wasm"));
    if (!stdLib || !wasm) throw new Error("Pyodide assets unavailable");
    return { stdLib: toAbsoluteUrl(stdLib), wasm: toAbsoluteUrl(wasm) };
  })();
  return assetUrls;
};

// The wasm is fetched with arrayBuffer and instantiated directly, so no
// content-type rewriting is needed and the app's own fetch is left untouched.

// Pyodide resolves the standard library through its own binary loader, which
// calls fetch(new URL(stdLibURL, location)) and reports only a generic
// "request failed". Reading the archive here instead uses the same helper as the
// wasm, produces a precise error, and hands Pyodide the bytes directly so its
// url handling never applies.
const fetchPyodideBytes = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Pyodide asset fetch failed with status ${response.status} for ${url}`,
    );
  return new Uint8Array(await response.arrayBuffer());
};

// Pyodide fetches its artifacts itself, eagerly, while building its Emscripten
// settings: the standard library through its own binary loader and the wasm
// through the response it later hands to instantiateStreaming. Neither can be
// redirected after the fact. Metro serves each asset from its own url carrying
// an unstable_path query, so the urls Pyodide builds are not fetchable as-is.
// Intercept just those two requests and answer them from the resolved assets,
// passing everything else the app fetches during the load straight through. The
// original fetch is restored as soon as the runtime has booted.
const withPyodideAssets = async <T>(
  assets: { stdLib: string; wasm: string },
  run: () => Promise<T>,
): Promise<T> => {
  const originalFetch = globalThis.fetch;
  const stdLibBytes = fetchPyodideBytes(assets.stdLib);
  const wasmBytes = fetchPyodideBytes(assets.wasm);
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

const loadPyodide = () => {
  pyodideInstance ??= (async () => {
    installPyodideEnvironmentShims();
    // Only the binary assets need resolving to a url. The lock file is JSON, so
    // Metro inlines it as a module and require returns the parsed object rather
    // than an asset id, which is why it is imported here instead.
    const urls = resolvePyodideAssetUrls();
    // Proof the interpreter is up.
    // A missing standard library is only reported by Pyodide through a
    // console.error during boot, so this is the earliest point where the
    // failure can be detected and reported usefully.
    const assertRuntimeReady = (instance: Pyodide) => {
      if (!instance.runPython || !instance.globals)
        throw new Error("Pyodide booted without a Python runtime");
      return instance;
    };
    // The lock file is a generated artifact with a stable top-level shape;
    // loadPyodide only reads its package metadata.
    const lockFileContents = pyodideLockFile as unknown as Lockfile;

    // The runtime normally fetches its Emscripten module by url and imports it.
    // Metro cannot dynamic-import a url, so the module is imported statically
    // and handed to the loader as a factory instead.
    const asmModule = (
      (await import("pyodide/pyodide.asm.mjs")) as {
        default: PyodideModuleFactory;
      }
    ).default;

    const { loadPyodide: createPyodide } = await import("pyodide");
    const pyodide = (await withPyodideAssets(urls, () =>
      createPyodide({
        // indexURL is a placeholder: Pyodide appends a trailing slash and joins
        // file names onto it, which Metro's per-asset urls cannot satisfy. The
        // stdlib and wasm are both supplied directly below.
        indexURL: "/",
        // Still required: Pyodide resolves the standard library from this value
        // when it builds its preRun hooks, and falls back to
        // indexURL + "python_stdlib.zip" when it is absent.
        stdLibURL: urls.stdLib,
        lockFileContents,
        // The lock file is vendored alongside the wasm, so the ABI always
        // matches. Skipping the check also stops Pyodide from replacing
        // locateFile with one that throws, which would break the override.
        checkAPIVersion: false,
        createPyodideModule: (settings) => {
          // Keep Pyodide's own instantiateWasm and feed it the wasm bytes. It
          // injects the Jsv error-marshalling imports the module needs before
          // instantiating; replacing it drops those, which still yields a live
          // instance but leaves the interpreter's error bridge unbound so
          // API._pyodide never becomes available. It reaches the bytes through
          // instantiateStreaming, so the response is returned as a promise the
          // same way fetch would, with a wasm content type it requires.
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
        // The stdlib is installed during boot inside a try/catch that logs to
        // console.error and continues, so a failure there shows up much later as
        // an undefined API. Verify the runtime actually came up and report it
        // as unavailable.
        //
        // The cached promise is cleared unconditionally: leaving it rejected
        // would replay this same failure on every keystroke forever, and the
        // editor would report the file as having no problems rather than as
        // unavailable. Rejections here are not always Error instances (a fetch
        // can reject with a DOMException from another realm), so the reason is
        // derived defensively rather than by narrowing on instanceof.
        pyodideInstance = undefined;
        if (__DEV__)
          console.warn(
            "Pyodide failed",
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
            assetUrls,
          );
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
