// @vitest-environment node
// Verifies diagnostics against real grammars, where error nodes actually span
// whole blocks. Synthetic nodes cannot reproduce that shape.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { getTreeSitterDiagnostics } from "../parsers/tree-sitter-analyzer";

const pythonWasm = require.resolve("../parsers/grammars/python.wasm");
const runtimeWasmUrl = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
let parser: Parser;

beforeAll(async () => {
  await Parser.init({ locateFile: () => runtimeWasmUrl });
  parser = new Parser();
  parser.setLanguage(await Language.load(pythonWasm));
});
afterAll(() => parser?.delete());

const analyze = (source: string) => {
  const tree = parser.parse(source);
  if (!tree) throw new Error("Python fixture failed to parse.");
  try {
    return getTreeSitterDiagnostics(source, tree.rootNode, {
      id: "python",
      label: "Python",
    });
  } finally {
    tree.delete();
  }
};

const lineOf = (source: string, offset: number) =>
  source.slice(0, offset).split("\n").length;

describe("python diagnostics precision", () => {
  it("keeps a block-spanning error on the first line of the fault", () => {
    // A missing colon makes the whole function one ERROR node.
    const source = "def add(a, b)\n    return a + b\n";
    const [finding] = analyze(source);
    expect(finding).toBeDefined();
    expect(finding.message).toMatch(/syntax/i);
    // The range must not run past the end of line one.
    expect(lineOf(source, finding.to)).toBe(1);
  });

  it("keeps every finding on the line where its text starts", () => {
    const source =
      "def mean(values):\n    values = list(values)\n    return sum(values) / len(values)\n";
    for (const finding of analyze(source)) {
      expect(lineOf(source, finding.to)).toBe(lineOf(source, finding.from));
    }
  });

  it("reports a missing token using the grammar's own expected text", () => {
    const source = "def f():\n    return a +\n";
    const findings = analyze(source);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings)
      expect(finding.message).not.toBe("Unexpected syntax");
  });

  it("leaves valid python free of findings", () => {
    const source = "def add(a, b):\n    return a + b\n";
    expect(analyze(source)).toEqual([]);
  });
});
