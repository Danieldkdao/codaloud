import { describe, expect, it } from "vitest";
import { toPrismDiagnostics } from "../parsers/prism-diagnostics";

// These cases pin the message and position behaviour without booting the wasm
// runtime, so a formatting regression is caught without a 16 MB asset. The
// runtime itself is exercised end to end in the native app.
type PrismError = {
  type: string;
  message: string;
  level: string;
  location?: { startOffset: number; length: number };
};

const error = (
  message: string,
  location: { startOffset: number; length: number },
  level = "syntax",
  type = "unexpected_token",
): PrismError => ({ type, message, level, location });

describe("toPrismDiagnostics", () => {
  it("reports the range Prism identified", () => {
    const source = "def foo\n  x = 1\n";
    const diagnostics = toPrismDiagnostics(source, [
      error("expected an `end` to close the `def` statement", {
        startOffset: 0,
        length: 3,
      }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 0,
      to: 3,
      severity: "error",
      source: "Prism",
    });
    expect(diagnostics[0].message).toBe(
      "Expected an `end` to close the `def` statement",
    );
  });

  it("keeps byte offsets on the correct line for multi-byte characters", () => {
    // "é" is two bytes, so the byte offset of the fault is past the UTF-16
    // offset. Reporting the raw byte offset would underline the wrong text.
    const source = 'x = "héllo"\ny = 1\n';
    const byteOffset = new TextEncoder().encode('x = "héllo"\n').length;
    const diagnostics = toPrismDiagnostics(source, [
      error("unexpected token", { startOffset: byteOffset, length: 4 }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("y = ");
  });

  it("widens a zero length location so the caret stays visible", () => {
    const source = "def foo\n  1\n";
    const diagnostics = toPrismDiagnostics(source, [
      error("unexpected end-of-input", { startOffset: 6, length: 0 }),
    ]);

    expect(diagnostics[0].to).toBeGreaterThan(diagnostics[0].from);
  });

  it("anchors a location-less error to the first line", () => {
    const source = "def foo\n  1\nend\n";
    const diagnostics = toPrismDiagnostics(source, [
      { type: "def_term", message: "unterminated", level: "syntax" },
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].from).toBe(0);
    expect(diagnostics[0].to).toBe(source.indexOf("\n"));
  });

  it("ignores lint-style findings that are not syntax errors", () => {
    const source = "x = 1\n";
    expect(
      toPrismDiagnostics(source, [
        error(
          "possibly useless use of a literal in void context",
          { startOffset: 0, length: 1 },
          "verbose",
          "useless_use_of_literal",
        ),
      ]),
    ).toEqual([]);
  });

  it("falls back to a stable code when Prism omits the type", () => {
    const source = "def foo\n  1\n";
    const diagnostics = toPrismDiagnostics(source, [
      {
        message: "unexpected end-of-input",
        level: "syntax",
        location: { startOffset: 6, length: 1 },
      },
    ]);

    expect(diagnostics[0].code).toBe("prism:syntax-error");
  });

  it("drops a finding whose offset falls outside the source", () => {
    const source = "x = 1\n";
    expect(
      toPrismDiagnostics(source, [
        error("bad", { startOffset: 500, length: 4 }, "syntax"),
      ]),
    ).toEqual([]);
  });
});
