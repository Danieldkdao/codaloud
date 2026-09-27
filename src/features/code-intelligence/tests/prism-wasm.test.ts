import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { instantiateWasiModule } from "../parsers/wasm-instance";
import {
  toPrismDiagnostics,
  type PrismError,
} from "../parsers/prism-diagnostics";

// Exercises the real Prism wasm through the same helper and shim the app uses.
// This is the check that the WASI surface is complete enough to link and that
// byte offsets from the real parser map onto the editor's UTF-16 positions. It
// deliberately goes through instantiateWasiModule rather than instantiating by
// hand, so the exact code path the editor runs cannot drift from what is tested.
type ParsePrism = (
  exports: Record<string, unknown>,
  source: string,
  options: Record<string, unknown>,
) => { errors: PrismError[]; warnings: PrismError[] };

const prismWasmPath = fileURLToPath(
  new URL("../parsers/runtimes/prism.wasm", import.meta.url),
);

const loadParser = async () => {
  const { parsePrism } =
    (await import("@ruby/prism/src/parsePrism.js")) as unknown as {
      parsePrism: ParsePrism;
    };
  const instance = await instantiateWasiModule(readFileSync(prismWasmPath));
  const exports = instance.exports as unknown as Record<string, unknown>;
  return (source: string) => {
    const result = parsePrism(exports, source, {});
    return toPrismDiagnostics(source, [...result.errors, ...result.warnings]);
  };
};

describe("prism wasm", () => {
  it("reports real CRuby syntax errors with correct positions", async () => {
    const parse = await loadParser();
    const source = "def foo\n  x = 1\n";
    const diagnostics = parse(source);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(
      diagnostics.some((diagnostic) =>
        diagnostic.message.toLowerCase().includes("end"),
      ),
    ).toBe(true);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.from).toBeGreaterThanOrEqual(0);
      expect(diagnostic.to).toBeLessThanOrEqual(source.length);
      expect(diagnostic.to).toBeGreaterThanOrEqual(diagnostic.from);
    }
  }, 30_000);

  it("reports nothing for valid ruby", async () => {
    const parse = await loadParser();
    expect(parse("def foo\n  1\nend\n")).toEqual([]);
    expect(parse("class A\n  def b\n    :c\n  end\nend\n")).toEqual([]);
  }, 30_000);

  it("places a diagnostic on the right line with multi-byte characters", async () => {
    const parse = await loadParser();
    // "é" and "ö" are two bytes each. A byte-offset implementation would place
    // the finding several characters too late, on the wrong line.
    const source = 'x = "héllo wörld"\ndef broken\n  1\n';
    const diagnostics = parse(source);

    expect(diagnostics.length).toBeGreaterThan(0);
    const message = diagnostics.find((diagnostic) =>
      diagnostic.message.includes("close the"),
    );
    expect(message).toBeDefined();
    // The unterminated def starts on line 2, after the 20 byte first line.
    // Prism reports that as byte offset 20, which is UTF-16 offset 18.
    expect(source.slice(message!.from, message!.to)).toBe("def");
    expect(source.slice(0, message!.from).split("\n")).toHaveLength(2);
  }, 30_000);
});
