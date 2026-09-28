import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createTreeSitterAnalyzer } from "../parsers/tree-sitter-runtime";

const runtimeWasmPath = require.resolve("web-tree-sitter/web-tree-sitter.wasm");

// The analyzer takes both wasm payloads as bytes, so read them off disk rather
// than passing a url for web-tree-sitter to resolve.
const bytes = (path: string) => async () =>
  new Uint8Array(readFileSync(path));

const parserFixtures = [
  {
    id: "java",
    label: "Java",
    valid:
      'class Main { String marker = "}"; /* } ] */ static void main(String[] args) {} }\n',
    invalid:
      "class Main { static void main(String[] args) {\r\n  String face = '😀';\r\n",
  },
  {
    id: "c",
    label: "C",
    valid: 'int main(void) { const char *marker = "}"; /* } ] */ return 0; }\n',
    invalid: 'int main(void) {\r\n  const char *face = "😀";\r\n',
  },
  {
    id: "cpp",
    label: "C++",
    valid: 'int main() { auto marker = "}"; /* } ] */ return 0; }\n',
    invalid: 'int main() {\r\n  const char *face = "😀";\r\n',
  },
  {
    id: "csharp",
    label: "C#",
    valid:
      'class Main { static string Marker = "}"; /* } ] */ static void Main() {} }\n',
    invalid: 'class Main { static void Main() {\r\n  var face = "😀";\r\n',
  },
  {
    id: "go",
    label: "Go",
    valid:
      'package main\nfunc main() { marker := "}"; _ = marker /* } ] */ }\n',
    invalid: 'package main\r\nfunc main() {\r\n  face := "😀"\r\n',
  },
  {
    id: "php",
    label: "PHP",
    valid:
      '<?php function greet($name) { $marker = "}"; /* } ] */ return "Hi $name"; }\n',
    invalid: '<?php function greet($name) {\r\n  $face = "😀";\r\n',
  },
  {
    id: "rust",
    label: "Rust",
    valid: 'fn main() { let marker = "}"; /* } ] */ }\n',
    invalid: 'fn main() {\r\n  let face = "😀";\r\n',
  },
  {
    id: "ruby",
    label: "Ruby",
    valid: 'def greet(name)\n  marker = "}" # ]\n  "Hi #{name}"\nend\n',
    invalid: 'def greet(name)\r\n  face = "😀"\r\n',
  },
  {
    id: "shell",
    label: "Shell",
    wasmFile: "bash",
    valid:
      "# fi ] } in a comment\nif [ -n \"$HOME\" ]; then\n  echo 'fi ] }'\nfi\n",
    invalid: "if true; then\n  echo 'open\nfi\n",
  },
  {
    id: "dockerfile",
    label: "Dockerfile",
    wasmFile: "containerfile",
    valid:
      "FROM node:22\nWORKDIR /app\nRUN printf '# not a Dockerfile comment\\n'\n",
    invalid: "NOT_A_DIRECTIVE image\n",
  },
] as const;

const analyzers = parserFixtures.map((grammar) => ({
  grammar,
  analyzer: createTreeSitterAnalyzer(
    {
      id: grammar.id,
      label: grammar.label,
    },
    {
      loadRuntimeBytes: bytes(runtimeWasmPath),
      loadGrammarBytes: bytes(
        new URL(
          `../parsers/grammars/${"wasmFile" in grammar ? grammar.wasmFile : grammar.id}.wasm`,
          import.meta.url,
        ).pathname,
      ),
    },
  ),
}));

afterAll(() => analyzers.forEach(({ analyzer }) => analyzer.dispose()));

describe.each(analyzers)(
  "bundled Tree-sitter $grammar.label grammar",
  ({ grammar, analyzer }) => {
    it("accepts a valid source file without diagnostics", async () => {
      await expect(analyzer.analyze(grammar.valid)).resolves.toEqual({
        status: "ready",
        diagnostics: [],
      });
    });

    it("accepts an empty document", async () => {
      await expect(analyzer.analyze("")).resolves.toEqual({
        status: "ready",
        diagnostics: [],
      });
    });

    it("reports malformed syntax with stable source and code", async () => {
      const result = await analyzer.analyze(grammar.invalid);

      expect(result.status).toBe("ready");
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]).toMatchObject({
        severity: "error",
        source: `Tree-sitter: ${grammar.label}`,
        code: `tree-sitter-${grammar.id}:syntax-error`,
      });
      expect(
        result.diagnostics.every(
          ({ from, to }) =>
            from >= 0 && from <= to && to <= grammar.invalid.length,
        ),
      ).toBe(true);
      expect(
        result.diagnostics.every(({ from, to }) =>
          [from, to].every(
            (offset) =>
              !(
                /[\uD800-\uDBFF]/.test(grammar.invalid[offset - 1] ?? "") &&
                /[\uDC00-\uDFFF]/.test(grammar.invalid[offset] ?? "")
              ),
          ),
        ),
      ).toBe(true);
    });
  },
);
