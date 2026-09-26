import { describe, expect, it } from "vitest";
import { getTreeSitterDiagnostics } from "../parsers/tree-sitter-analyzer";

type TestNode = {
  type: string;
  childCount: number;
  isError: boolean;
  isMissing: boolean;
  startIndex: number;
  endIndex: number;
  children: TestNode[];
};

const node = (
  type: string,
  startIndex: number,
  endIndex: number,
  children: TestNode[] = [],
  flags: Partial<Pick<TestNode, "isError" | "isMissing">> = {},
): TestNode => ({
  type,
  startIndex,
  endIndex,
  childCount: children.length,
  children,
  isError: false,
  isMissing: false,
  ...flags,
});

describe("getTreeSitterDiagnostics", () => {
  it("converts grammar error nodes to source-labeled parser findings", () => {
    const root = node("module", 0, 9, [
      node("ERROR", 8, 9, [], { isError: true }),
    ]);
    expect(
      getTreeSitterDiagnostics("print(x=)", root, {
        id: "python",
        label: "Python",
      }),
    ).toEqual([
      {
        from: 8,
        to: 9,
        severity: "error",
        message: "Unexpected syntax",
        source: "Tree-sitter: Python",
        code: "tree-sitter-python:syntax-error",
      },
    ]);
  });

  it("maps UTF-8 byte indices to exact UTF-16 offsets after non-BMP text", () => {
    const content = "😀; x = ;";
    const source = node("ERROR", 10, 11, [], { isError: true });
    const root = node("module", 0, 11, [source]);
    const result = getTreeSitterDiagnostics(content, root, {
      id: "javascript",
      label: "JavaScript",
    });
    expect(result[0]).toMatchObject({
      from: 8,
      to: 9,
      source: "Tree-sitter: JavaScript",
    });
  });

  it("allows zero-width missing nodes and drops impossible byte ranges", () => {
    const root = node("module", 0, 3, [
      node("identifier", 3, 3, [], { isMissing: true }),
      node("ERROR", 4, 9, [], { isError: true }),
    ]);
    expect(
      getTreeSitterDiagnostics("abc", root, { id: "rust", label: "Rust" }),
    ).toEqual([
      {
        from: 3,
        to: 3,
        severity: "error",
        message: "Expected identifier",
        source: "Tree-sitter: Rust",
        code: "tree-sitter-rust:syntax-error",
      },
    ]);
  });

  it("ignores valid syntax tree nodes, including syntax-like text in literals", () => {
    const content = 'const value = "ERROR ( missing }";';
    const root = node("program", 0, 33, [
      node("string", 14, 33),
      node("identifier", 6, 11),
    ]);
    expect(
      getTreeSitterDiagnostics(content, root, {
        id: "javascript",
        label: "JavaScript",
      }),
    ).toEqual([]);
  });
});
