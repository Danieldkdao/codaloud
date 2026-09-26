import { describe, expect, it } from "vitest";
import { codeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";

describe("codeDiagnosticSchema", () => {
  it("requires a stable string code and diagnostic source", () => {
    expect(
      codeDiagnosticSchema.safeParse({
        from: 2,
        to: 4,
        severity: "error",
        message: "Unexpected token",
        source: "Tree-sitter: Python",
        code: "tree-sitter-python:syntax-error",
      }).success,
    ).toBe(true);
    expect(
      codeDiagnosticSchema.safeParse({
        from: 2,
        to: 4,
        severity: "error",
        message: "Unexpected token",
        code: 123,
      }).success,
    ).toBe(false);
  });

  it("preserves zero-width findings while rejecting reversed ranges", () => {
    const diagnostic = {
      from: 5,
      to: 5,
      severity: "error",
      message: "Expected expression",
      source: "TypeScript",
      code: "TS1109",
    };
    expect(codeDiagnosticSchema.safeParse(diagnostic).success).toBe(true);
    expect(
      codeDiagnosticSchema.safeParse({ ...diagnostic, from: 6 }).success,
    ).toBe(false);
  });
});
