import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// native-runtime reads bundled assets through React Native's asset resolver.
// Stub it so this stays a plain Node test; the real resolver is covered by the
// app's own bundling.
vi.mock("react-native", () => ({
  Image: {
    resolveAssetSource: (asset: number) =>
      typeof asset === "number" ? { uri: `asset://${asset}` } : null,
  },
}));

const { resolveNativeAssetUrl } = await import("../parsers/native-runtime");
const { default: pyodideLockFile } =
  await import("../parsers/runtimes/pyodide-lock.json");

// Metro inlines JSON as a module and binary formats as assets, so a require of
// the wrong kind returns the parsed object rather than an asset id. Passing that
// object to resolveNativeAssetUrl yields null and the runtime fails to load with
// a message that points nowhere near the cause, so assert each file resolves to
// something usable and the lock file is a real object.
const assetPath = (name: string) =>
  fileURLToPath(new URL(`../parsers/runtimes/${name}`, import.meta.url));

describe("runtime asset resolution", () => {
  it.each([["prism.wasm"], ["shellcheck.wasm"], ["pyodide.asm.wasm"]])(
    "resolves %s from disk in a bundler-agnostic way",
    (name) => {
      // Node's require of a wasm file is not an asset id, so mirror what Metro
      // does by resolving the path directly. This confirms the file is present
      // and non-empty, which is what the bundler later turns into an asset id.
      const bytes = readFileSync(assetPath(name));
      expect(bytes.byteLength).toBeGreaterThan(0);
      // The first four bytes are the WebAssembly magic number.
      expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    },
  );

  it("treats a parsed json module as contents, not an asset id", () => {
    // This is the shape Metro hands back for a JSON require, and the exact
    // value that previously reached resolveNativeAssetUrl.
    expect(typeof pyodideLockFile).toBe("object");
    expect(resolveNativeAssetUrl(pyodideLockFile as never)).toBeNull();
    expect(pyodideLockFile).toHaveProperty("info.abi_version");
    expect(pyodideLockFile).toHaveProperty("packages");
  });

  it("returns null for a non-asset value instead of throwing", () => {
    expect(resolveNativeAssetUrl(undefined)).toBeNull();
    expect(resolveNativeAssetUrl({} as never)).toBeNull();
  });

  it("resolves a numeric asset id through the React Native resolver", () => {
    // Metro hands a number for wasm and zip, which the resolver turns into a
    // URL the runtime can fetch.
    expect(resolveNativeAssetUrl(7)).toBe("asset://7");
    expect(resolveNativeAssetUrl("file:///tmp/a.zip")).toBe(
      "file:///tmp/a.zip",
    );
  });
});
