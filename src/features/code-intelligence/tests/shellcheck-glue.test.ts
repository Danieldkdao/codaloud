import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import shellCheckGlue from "../parsers/shellcheck-js-ffi-glue";

// The glue module is keyed by GHC-mangled symbol names. A single wrong
// character produces a wasm LinkError at instantiation, which is easy to
// misdiagnose as a broken runtime, so assert the key set against the module's
// actual import list.
const shellcheckWasmPath = fileURLToPath(
  new URL("../parsers/runtimes/shellcheck.wasm", import.meta.url),
);

describe("shellcheck js ffi glue", () => {
  it("provides a callable for every import the wasm declares", () => {
    const module = new WebAssembly.Module(readFileSync(shellcheckWasmPath));
    const glue = shellCheckGlue({});
    const required = WebAssembly.Module.imports(module)
      .filter((entry) => entry.module === "ghc_wasm_jsffi")
      .map((entry) => entry.name);

    expect(required.length).toBeGreaterThan(0);
    for (const name of required) {
      expect(
        typeof glue[name],
        `missing glue export for ${name}`,
      ).toBe("function");
    }
  }, 60_000);
});
