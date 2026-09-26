import { describe, expect, it } from "vitest";
import { normalizeCodeDiagnostics } from "../diagnostics";

const finding = {
  from: 0,
  to: 1,
  severity: "error" as const,
  message: "Syntax error",
  source: "Tree-sitter: Python",
  code: "tree-sitter-python:syntax-error",
};

describe("normalizeCodeDiagnostics", () => {
  it("keeps valid UTF-16 ranges, including zero-width EOF and CRLF positions", () => {
    const content = "😀\r\nvalue";
    expect(
      normalizeCodeDiagnostics(content, [
        { ...finding, from: 2, to: 4 },
        { ...finding, from: content.length, to: content.length },
      ]),
    ).toHaveLength(2);
  });

  it("drops invalid or out-of-document ranges without clamping them", () => {
    const invalid = [
      { ...finding, from: -1 },
      { ...finding, from: 3, to: 2 },
      { ...finding, from: 0, to: 9 },
      { ...finding, from: 1.5 },
      { ...finding, from: Number.NaN },
      { ...finding, source: "" },
    ];
    expect(normalizeCodeDiagnostics("abc", invalid)).toEqual([]);
  });

  it("deduplicates exact findings while retaining distinct sources and codes", () => {
    const duplicate = { ...finding };
    expect(
      normalizeCodeDiagnostics("abc", [
        finding,
        duplicate,
        { ...finding, source: "Other parser" },
        { ...finding, code: "other-code" },
      ]),
    ).toHaveLength(3);
  });

  it("caps excessive parser output", () => {
    expect(
      normalizeCodeDiagnostics(
        "a",
        Array.from({ length: 250 }, (_, index) => ({
          ...finding,
          from: 0,
          to: 1,
          code: `rule-${index}`,
        })),
      ),
    ).toHaveLength(200);
  });
});
