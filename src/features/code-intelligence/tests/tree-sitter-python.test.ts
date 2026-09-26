import { afterAll, describe, expect, it } from "vitest";
import { createTreeSitterAnalyzer } from "../parsers/tree-sitter-runtime";

const analyzer = createTreeSitterAnalyzer(
  {
    id: "python",
    label: "Python",
    wasmUrl: new URL("../parsers/grammars/python.wasm", import.meta.url)
      .pathname,
  },
  require.resolve("web-tree-sitter/web-tree-sitter.wasm"),
);

afterAll(() => analyzer.dispose());

describe("bundled Python Tree-sitter grammar", () => {
  it("accepts valid Python without diagnostics", async () => {
    const content = "def greet(name):\n    return f'Hi, {name}'\n";
    await expect(analyzer.analyze(content)).resolves.toEqual({
      status: "ready",
      diagnostics: [],
    });
  });

  it("reports malformed Python from the bundled grammar", async () => {
    const content = "def broken(:\n    pass\n";
    const result = await analyzer.analyze(content);

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "Tree-sitter: Python",
        code: "tree-sitter-python:syntax-error",
      }),
    ]);
  });

  it("returns normalized findings with UTF-16 offsets for CRLF documents", async () => {
    const content = "name = '😀'\r\nvalue =\r\n";
    const result = await analyzer.analyze(content);

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].from).toBe(11);
    expect(result.diagnostics[0].to).toBe(18);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      source: "Tree-sitter: Python",
      code: "tree-sitter-python:syntax-error",
    });
  });

  it("returns ready for an empty document", async () => {
    await expect(analyzer.analyze("")).resolves.toEqual({
      status: "ready",
      diagnostics: [],
    });
  });

  it("fails closed for content above the parser input cap", async () => {
    await expect(
      analyzer.analyze("x".repeat(1024 * 1024 + 1)),
    ).resolves.toEqual({
      status: "unavailable",
      diagnostics: [],
    });
  });
});
