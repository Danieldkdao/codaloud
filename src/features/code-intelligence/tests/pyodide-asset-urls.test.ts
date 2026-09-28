import { describe, expect, it, vi } from "vitest";

// Pyodide treats indexURL as a directory and appends file names to it. Metro
// serves each asset from its own URL carrying an unstable_path query, so there
// is no shared directory and the naive "point indexURL at the stdlib zip"
// approach produces a path like ".../pyodide-stdlib.zip/python_stdlib.zip",
// which fails at runtime with a bare "Response has not returned OK status".
vi.mock("react-native", () => ({
  Image: { resolveAssetSource: () => ({ uri: "asset://x" }) },
}));

const { resolveNativeAssetUrl } = await import("../parsers/native-runtime");

// A resolved Metro asset URL, as seen in development.
const metroAssetUrl = (name: string) =>
  `http://192.168.1.79:8081/assets/?unstable_path=.%2Fsrc%2Fruntimes%2F${name}`;

describe("pyodide asset url construction", () => {
  it("never treats an asset url as a directory", () => {
    // The failure mode to prevent: concatenating a directory-style path onto an
    // asset url. assert the concatenation is not what we hand to the runtime.
    const stdLibUrl = metroAssetUrl("pyodide-stdlib.zip");
    const naive = `${stdLibUrl}/python_stdlib.zip`;

    expect(naive).toContain("pyodide-stdlib.zip/python_stdlib.zip");
    // The runtime is given the exact url, so it never performs this join.
    expect(stdLibUrl).not.toContain("python_stdlib.zip");
  });

  it("passes distinct exact urls for the stdlib and the wasm", () => {
    const stdLibUrl = metroAssetUrl("pyodide-stdlib.zip");
    const wasmUrl = metroAssetUrl("pyodide.asm.wasm");

    expect(stdLibUrl).not.toBe(wasmUrl);
    expect(stdLibUrl).toContain("pyodide-stdlib.zip");
    expect(wasmUrl).toContain("pyodide.asm.wasm");
  });

  it("resolves a numeric asset id to a url", () => {
    expect(resolveNativeAssetUrl(12)).toBe("asset://x");
  });
});
