import { createWasiImports } from "./wasi-imports";

// Fetching and instantiating a runtime is kept apart from resolving a bundled
// asset url, which needs React Native. Tests drive the real wasm modules through
// this file, so it must stay free of native imports.

export const loadWasmBytes = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch wasm: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

// Instantiate a WASI-linked module. The instance memory is handed back to the
// shim because preview1 calls receive pointers into it.
export const instantiateWasiModule = async (
  bytes: Uint8Array,
  extraImports?: Record<string, unknown>,
  options?: { onStderr?: (message: string) => void },
) => {
  const wasi = createWasiImports({ onStderr: options?.onStderr });
  const result = (await WebAssembly.instantiate(bytes, {
    ...extraImports,
    ...wasi.imports,
  })) as WebAssembly.Instance & WebAssembly.WebAssemblyInstantiatedSource;
  // The BufferSource overload of WebAssembly.instantiate is specified to resolve
  // to an Instance, but V8 and JavaScriptCore both resolve it to a
  // WebAssemblyInstantiatedSource instead. The editor runs inside a WebView, so
  // the engine is not ours to choose, and a hand-rolled test would only ever
  // prove the shape of the host it ran on. Accept either rather than assuming
  // one: reading .exports off the wrong shape yields undefined, which surfaces
  // much later as a runtime reporting itself unavailable.
  const instance = result.instance ?? result;
  const memory = instance.exports?.memory;
  if (!(memory instanceof WebAssembly.Memory))
    throw new Error("WASM module does not export a memory");
  wasi.setMemory(memory);
  return instance;
};
