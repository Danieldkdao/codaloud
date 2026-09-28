import { describe, expect, it } from "vitest";
import {
  PYTHON_CHECK_EXPRESSION,
  PYTHON_CHECK_INSTALL_SOURCE,
  parsePythonCheckResult,
  toPythonDiagnostics,
  type PythonCheckResult,
} from "../parsers/python-diagnostics";

const result = (
  errors: { msg: string; lineno?: number; offset?: number }[],
): PythonCheckResult => ({ ok: errors.length === 0, errors });

const error = (
  overrides: { msg: string; lineno?: number; offset?: number } = {
    msg: "'(' was never closed",
    lineno: 1,
    offset: 6,
  },
) => result([overrides]);

// The exact source from the reported screenshot: two missing colons and one
// stray bracket. CPython stops at the first of these, so reporting only one at
// a time is the behaviour these tests exist to prevent.
const SCREENSHOT_SOURCE = `def add(a, b)
    return a + b

def mean(values):
    values = list(values))
    if not values
        return 0.0
    return sum(values)
`;

describe("toPythonDiagnostics", () => {
  it("reports nothing when the source compiles", () => {
    expect(toPythonDiagnostics("x = 1\n", result([]))).toEqual([]);
    expect(toPythonDiagnostics("x = 1\n", null)).toEqual([]);
  });

  // The regression this file was written for: the checker now returns every
  // error it found, and each one must reach the editor.
  it("maps every reported error, not just the first", () => {
    const diagnostics = toPythonDiagnostics(
      SCREENSHOT_SOURCE,
      result([
        { msg: "unmatched ')'", lineno: 5, offset: 26 },
        { msg: "expected ':'", lineno: 1, offset: 14 },
        { msg: "expected ':'", lineno: 6, offset: 18 },
      ]),
    );

    expect(diagnostics).toHaveLength(3);
    const lineOf = (offset: number) =>
      SCREENSHOT_SOURCE.slice(0, offset).split("\n").length;
    // The checker reports the tokenizer error before the parser reaches the
    // missing colons, so the editor keeps that order rather than sorting.
    expect(diagnostics.map((item) => lineOf(item.from))).toEqual([5, 1, 6]);
    expect(diagnostics.map((item) => item.message)).toEqual([
      "unmatched ')'",
      "expected ':'",
      "expected ':'",
    ]);
  });

  it("gives each error a distinct span", () => {
    const diagnostics = toPythonDiagnostics(
      SCREENSHOT_SOURCE,
      result([
        { msg: "expected ':'", lineno: 1, offset: 14 },
        { msg: "expected ':'", lineno: 6, offset: 18 },
      ]),
    );

    const spans = diagnostics.map((item) => `${item.from}-${item.to}`);
    expect(new Set(spans).size).toBe(2);
  });

  it("keeps the errors it can map when one names a line outside the document", () => {
    // A single unusable entry must not discard the rest of the list.
    const diagnostics = toPythonDiagnostics(
      "x = 1\n",
      result([
        { msg: "out of range", lineno: 99 },
        { msg: "expected ':'", lineno: 1, offset: 5 },
      ]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe("expected ':'");
  });

  it("places an error with no position at the start of the document", () => {
    // A null byte in the source raises ValueError, which carries no line.
    const diagnostics = toPythonDiagnostics(
      "x = 1\n",
      result([{ msg: "bad" }]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].from).toBe(0);
  });

  it("maps a line and column onto the editor position", () => {
    const source = "x = 1\ny = (1\n";
    const diagnostics = toPythonDiagnostics(
      source,
      error({ msg: "'(' was never closed", lineno: 2, offset: 5 }),
    );

    expect(diagnostics).toHaveLength(1);
    // CPython columns are one-based, so column 5 is index 4 of "y = (1".
    expect(diagnostics[0].from).toBe(10);
    expect(diagnostics[0].to).toBeGreaterThan(diagnostics[0].from);
    expect(diagnostics[0].message).toBe("'(' was never closed");
    expect(diagnostics[0].code).toBe("python:syntax-error");
  });

  it("reports an indentation error on the line CPython names", () => {
    const source = "def f():\nreturn 1\n";
    const diagnostics = toPythonDiagnostics(
      source,
      error({
        msg: "expected an indented block after function definition",
        lineno: 2,
        offset: 1,
      }),
    );

    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("r");
  });

  it("keeps a finding on the correct line after multi-byte characters", () => {
    // "é" is two bytes, so a byte-based implementation would land on line 2.
    const source = "x = 'héllo wörld'\ny = (1\n";
    const diagnostics = toPythonDiagnostics(
      source,
      error({ msg: "'(' was never closed", lineno: 2, offset: 5 }),
    );

    expect(diagnostics[0].from).toBeGreaterThan(0);
    expect(source.slice(0, diagnostics[0].from).split("\n")).toHaveLength(2);
  });

  it("clamps a column past the end of the reported line", () => {
    const source = "x = 1\nif True\n    pass";
    const diagnostics = toPythonDiagnostics(
      source,
      error({ msg: "expected ':'", lineno: 2, offset: 999 }),
    );

    expect(diagnostics[0].to).toBeLessThanOrEqual(source.length);
    expect(diagnostics[0].to).toBeGreaterThanOrEqual(diagnostics[0].from);
  });

  // CPython points past the end of the line for errors like "expected ':'",
  // which used to collapse the range to zero width and leave an invisible dot
  // where the squiggle should be.
  it("underlines the last character when the column points past the line", () => {
    const source = "def add(a, b)\n    return a + b\n";
    const diagnostics = toPythonDiagnostics(
      source,
      error({ msg: "expected ':'", lineno: 1, offset: 14 }),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].to).toBeGreaterThan(diagnostics[0].from);
    // Line 1 is "def add(a, b)"; the marker must stay on it and not cover the
    // line break that follows.
    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe(")");
  });
});

// The checker returns json.dumps output, so exactly one JSON layer crosses the
// Pyodide boundary. A second json.dumps around the call is what made every
// Python file report zero diagnostics without a single console message.
describe("parsePythonCheckResult", () => {
  const pythonOutput = JSON.stringify({
    ok: false,
    errors: [
      { msg: "unmatched ')'", lineno: 5, offset: 26 },
      { msg: "expected ':'", lineno: 1, offset: 14 },
    ],
  });

  it("decodes the JSON string the Python checker returns", () => {
    expect(parsePythonCheckResult(pythonOutput)).toEqual({
      ok: false,
      errors: [
        { msg: "unmatched ')'", lineno: 5, offset: 26 },
        { msg: "expected ':'", lineno: 1, offset: 14 },
      ],
    });
  });

  it("decodes a clean result as an empty error list", () => {
    expect(parsePythonCheckResult({ ok: true, errors: [] })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("decodes a result that already arrived as an object", () => {
    expect(parsePythonCheckResult({ ok: true, errors: [] }).ok).toBe(true);
  });

  it("rejects a result that was encoded twice", () => {
    // json.dumps applied again turns the JSON text into a JSON string literal.
    expect(() => parsePythonCheckResult(JSON.stringify(pythonOutput))).toThrow(
      /Python checker did not return a result object/,
    );
  });

  it("rejects text that is not JSON", () => {
    expect(() => parsePythonCheckResult("ok")).toThrow(/not JSON/);
  });

  it("rejects a result with no error list", () => {
    expect(() => parsePythonCheckResult({ ok: false })).toThrow(
      /missing its error list/,
    );
  });

  it("rejects an error entry with no message", () => {
    expect(() =>
      parsePythonCheckResult({ ok: false, errors: [{ lineno: 1 }] }),
    ).toThrow(/missing its error message/);
  });

  it("keeps the checked expression and the installed source in sync", () => {
    // Guards a rename on either side from silently disabling the checker.
    const name = PYTHON_CHECK_EXPRESSION.replace(/^(\w+)\(.*\)$/, "$1");
    expect(PYTHON_CHECK_INSTALL_SOURCE).toContain(`def ${name}(source)`);
    // The expression must call the checker directly. Encoding its result again
    // here is exactly the defect this asserts against.
    expect(PYTHON_CHECK_EXPRESSION).not.toContain("json.dumps");
  });
});
