import { describe, expect, it } from "vitest";
import {
  toShellCheckDiagnostics,
  type ShellCheckLintResult,
} from "../parsers/shellcheck-diagnostics";

const result = (
  overrides: Partial<ShellCheckLintResult> = {},
): ShellCheckLintResult => ({
  line: 1,
  column: 1,
  code: 2086,
  severity: "warning",
  message: "Double quote to prevent globbing.",
  ...overrides,
});

describe("toShellCheckDiagnostics", () => {
  it("maps a line and column onto the editor position", () => {
    const source = "echo hello\necho $UNQUOTED\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 2, column: 6 }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe(
      "$UNQUOTED",
    );
  });

  it("underlines to the end of the line when no end is reported", () => {
    const source = "echo hello\nls /tmp\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 2, column: 4 }),
    ]);

    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("/tmp");
  });

  it("honours an explicit end position", () => {
    const source = "rm -rf /tmp/build\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({
        line: 1,
        column: 8,
        endLine: 1,
        endColumn: 12,
        code: 2114,
        message: "Warning: deletes a system directory.",
      }),
    ]);

    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("/tmp");
    expect(diagnostics[0].message).toBe("deletes a system directory.");
    expect(diagnostics[0].code).toBe("shellcheck:SC2114");
  });

  it("drops style findings but keeps info findings", () => {
    const source = "echo hi\n";
    expect(
      toShellCheckDiagnostics(source, [result({ severity: "style" })]),
    ).toEqual([]);
    expect(
      toShellCheckDiagnostics(source, [
        result({ severity: "info", code: 2034 }),
      ])[0].severity,
    ).toBe("info");
  });

  it("ignores a line outside the document", () => {
    expect(
      toShellCheckDiagnostics("echo hi\n", [result({ line: 99 })]),
    ).toEqual([]);
  });

  it("gives a finding with no end position a span that is visible", () => {
    // ShellCheck parse errors (SC1xxx) report column === endColumn, because the
    // parser has no token to point at. Taken literally the range collapses and
    // the marker renders as a bare dot with no underline, so a broken script
    // counts in the badge but shows nothing in the editor.
    const source = "echo start\nif true\n  echo hi\nfi\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: 1,
        code: 1049,
        severity: "error",
        message: "Did you forget the 'then' for this 'if'?",
      }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].to).toBeGreaterThan(diagnostics[0].from);
    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("i");
  });

  it("keeps a parse error on the line ShellCheck names", () => {
    const source = "echo start\nif true\n  echo hi\nfi\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 2, column: 1, endLine: 2, endColumn: 1, code: 1049 }),
      result({
        line: 4,
        column: 1,
        endLine: 4,
        endColumn: 1,
        code: 1050,
        message: "Expected 'then'.",
      }),
    ]);

    const lineOf = (offset: number) =>
      source.slice(0, offset).split("\n").length;
    expect(diagnostics.map((item) => lineOf(item.from))).toEqual([2, 4]);
    for (const item of diagnostics) expect(item.to).toBeGreaterThan(item.from);
  });

  it("clamps a column past the end of the line to the last character", () => {
    const source = "ls /tmp\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 1, column: 999 }),
    ]);

    expect(diagnostics[0].to).toBeGreaterThan(diagnostics[0].from);
    expect(diagnostics[0].to).toBeLessThanOrEqual(source.length);
    // A column past the end of the line is pulled back to the last character, so
    // the marker stays on line 1 rather than covering the line break.
    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("p");
  });

  it("includes the final character when the end column reaches it", () => {
    // The end is allowed to sit one past the line's last character, so a token
    // that runs to the end of the line is not truncated by its own end column.
    const source = "echo $UNQUOTED\n";
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 1, column: 6, endLine: 1, endColumn: 15, code: 2086 }),
    ]);

    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe(
      "$UNQUOTED",
    );
  });

  it("resolves positions on lines that follow multi-byte characters", () => {
    const source = 'echo "héllo wörld"\nrm -rf /tmp\n';
    const diagnostics = toShellCheckDiagnostics(source, [
      result({ line: 2, column: 8 }),
    ]);

    expect(source.slice(diagnostics[0].from, diagnostics[0].to)).toBe("/tmp");
  });
});
