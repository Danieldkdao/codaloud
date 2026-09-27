import { describe, expect, it } from "vitest";

// The wasm imports two functions that marshal JavaScript errors into the Python
// interpreter. Pyodide injects them into the import object itself, inside its
// own instantiateWasm. Replacing that hook to supply the bytes directly still
// yields a live instance, but leaves the error bridge unbound: the interpreter
// never finishes booting and the first run fails with
// "undefined is not an object (evaluating 'API._pyodide._base.eval_code')".
// Assert the module still declares them, so a future attempt to swap
// instantiateWasm is caught before it ships.
describe("pyodide wasm error bridge", () => {
  it("declares the Jsv error imports the runtime must inject", async () => {
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile("node_modules/pyodide/pyodide.asm.wasm");
    const module = new WebAssembly.Module(bytes);
    const names = WebAssembly.Module.imports(module).map((entry) => entry.name);

    expect(names).toContain("Jsv_GetError_import");
    expect(names).toContain("JsvError_Check");
  }, 60_000);
});
