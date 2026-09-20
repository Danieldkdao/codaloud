import ts from "../generated/compiler";
import { expect, it, vi } from "vitest";
import { analyzeTypeScript, createTypeScriptAnalyzer } from "../analysis";
vi.mock("../generated/compiler", async (original) => {
  const actual = await original<typeof import("../generated/compiler")>();
  return { default: { ...actual.default, createLanguageService: vi.fn(actual.default.createLanguageService) } };
});
const analyze = (content: string, files: Record<string, string> = {}, position?: number) => analyzeTypeScript({ path: "src/main.ts", content, position }, async (path) => files[path] ?? null);
it("reports syntax and semantic errors using bundled standard libraries offline", async () => {
  const result = await analyze('const value: number = "wrong";\nconst list: Array<string> = [];');
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).toContain(2322);
  expect("diagnostics" in result && result.diagnostics.some((item) => item.message.includes("Cannot find name 'Array'"))).toBe(false);
});
it("resolves imported local declarations and tsconfig aliases", async () => {
  const result = await analyze('import { count } from "@/value"; const text: string = count;', {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] }, strict: true } }),
    "src/value.ts": "export const count = 42;",
  });
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).toContain(2322);
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).not.toContain(2307);
});
it("offers completions from real types without fetching a compiler", async () => {
  const content = 'const value = "hello"; value.toU';
  const result = await analyze(content, {}, content.length);
  expect("completions" in result && result.completions.some((item) => item.label === "toUpperCase")).toBe(true);
});

const diagnosticCodes = (result: Awaited<ReturnType<typeof analyzeTypeScript>>) =>
  "diagnostics" in result ? result.diagnostics.map((item) => item.code) : [];

it("updates diagnostics and completions across edits in one analysis session", async () => {
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    const input = { path: "src/main.ts", content: 'const value: number = "wrong";' };
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain(2322);
    expect(diagnosticCodes(await analyzer.analyze({ ...input, content: "const value: number = 42;" }))).not.toContain(2322);
    const content = "const value = 42; value.toF";
    const completion = await analyzer.analyze({ ...input, content, position: content.length });
    expect("completions" in completion && completion.completions.some((item) => item.label === "toFixed")).toBe(true);
  } finally { await analyzer.dispose(); }
});

it("rechecks changed, removed, and newly created imports without changing the editor text", async () => {
  const files: Record<string, string> = {};
  const analyzer = createTypeScriptAnalyzer(async (path) => files[path] ?? null);
  const input = { path: "src/main.ts", content: 'import { count } from "./value"; const text: string = count;' };
  try {
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain(2307);
    files["src/value.ts"] = "export const count = 42;";
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain(2322);
    files["src/value.ts"] = 'export const count = "hello";';
    expect(diagnosticCodes(await analyzer.analyze(input))).not.toContain(2322);
    delete files["src/value.ts"];
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain(2307);
  } finally { await analyzer.dispose(); }
});

it("rechecks tsconfig aliases and package entry points between analyses", async () => {
  const files: Record<string, string> = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "src/value.ts": "export const count = 42;",
    "lib/value.ts": 'export const count = "hello";',
    "node_modules/example/package.json": '{"types":"number.d.ts"}',
    "node_modules/example/number.d.ts": "export const other: number;",
    "node_modules/example/string.d.ts": "export const other: string;",
  };
  const analyzer = createTypeScriptAnalyzer(async (path) => files[path] ?? null);
  const input = { path: "src/main.ts", content: 'import { count } from "@/value"; import { other } from "example"; const text: string = count; const text2: string = other;' };
  try {
    expect(diagnosticCodes(await analyzer.analyze(input)).filter((code) => code === 2322)).toHaveLength(2);
    files["tsconfig.json"] = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./lib/*"] } } });
    files["node_modules/example/package.json"] = '{"types":"string.d.ts"}';
    const codes = diagnosticCodes(await analyzer.analyze(input));
    expect(codes).not.toContain(2322);
    expect(codes).not.toContain(2307);
  } finally { await analyzer.dispose(); }
});

it("isolates workspaces and replaces the active file when switching tabs", async () => {
  const first = createTypeScriptAnalyzer(async (path) => path === "src/value.ts" ? "export const count = 42;" : null);
  const second = createTypeScriptAnalyzer(async (path) => path === "src/value.ts" ? 'export const count = "hello";' : null);
  const input = { path: "src/main.ts", content: 'import { count } from "./value"; const text: string = count;' };
  try {
    expect(diagnosticCodes(await first.analyze(input))).toContain(2322);
    expect(diagnosticCodes(await second.analyze(input))).not.toContain(2322);
    expect(diagnosticCodes(await first.analyze({ path: "src/other.ts", content: "const value: number = true;" }))).toContain(2322);
    expect(diagnosticCodes(await first.analyze(input))).toContain(2322);
  } finally { await Promise.all([first.dispose(), second.dispose()]); }
});

it("serializes overlapping requests and recovers after a read failure", async () => {
  let failed = false;
  const analyzer = createTypeScriptAnalyzer(async () => {
    if (!failed) { failed = true; throw new Error("Read failed"); }
    return null;
  });
  try {
    const bad = analyzer.analyze({ path: "main.ts", content: 'const value: number = "wrong";' });
    const good = analyzer.analyze({ path: "main.ts", content: "const value: number = 42;" });
    await expect(bad).rejects.toThrow("Read failed");
    expect(diagnosticCodes(await good)).not.toContain(2322);
  } finally { await analyzer.dispose(); }
});


it("keeps the compiler warm across tab switches while replacing the active graph", async () => {
  const createService = vi.mocked(ts.createLanguageService);
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    for (const path of ["a.ts", "b.ts", "a.ts", "b.ts", "a.ts"]) {
      const content = path === "a.ts" ? 'const value: number = "wrong";' : "const value: number = 42;";
      const codes = diagnosticCodes(await analyzer.analyze({ path, content }));
      expect(codes.includes(2322)).toBe(path === "a.ts");
    }
    expect(createService).toHaveBeenCalledOnce();
  } finally { await analyzer.dispose(); }
});

it("formats a live unsaved buffer using the requested indentation and newline convention", async () => {
  const result = await analyzeTypeScript({ path: "main.ts", content: "function x(){\r\nreturn {a:1,b:2}\r\n}", operation: "format", tabSize: 4, useTabs: true }, async () => null);
  expect("edits" in result).toBe(true);
  if (!("edits" in result)) return;
  let content = "function x(){\r\nreturn {a:1,b:2}\r\n}";
  for (const edit of [...result.edits].sort((a, b) => b.from - a.from)) content = content.slice(0, edit.from) + edit.insert + content.slice(edit.to);
  expect(content).toContain("\r\n\treturn"); expect(content).toContain("a: 1");
});
it("organizes imports semantically while preserving side-effect and used type imports", async () => {
  const input = 'import "./side-effect";\nimport { unused, used } from "./values";\nimport type { Item } from "./types";\nexport const x: Item = used;';
  const files: Record<string, string> = { "values.ts": "export const unused=1, used={id:1};", "types.ts": "export type Item = {id:number};", "side-effect.ts": "export {};" };
  const result = await analyzeTypeScript({ path: "main.ts", content: input, operation: "organize-imports" }, async (path) => files[path] ?? null);
  expect("edits" in result).toBe(true); if (!("edits" in result)) return;
  let content = input;
  for (const edit of [...result.edits].sort((a, b) => b.from - a.from)) content = content.slice(0, edit.from) + edit.insert + content.slice(edit.to);
  expect(content).not.toContain("unused"); expect(content).toContain('import "./side-effect"'); expect(content).toContain("import type { Item }"); expect(content).toContain("used");
});

it("reuses recently validated dependencies for rapid autocomplete without skipping diagnostic revalidation", async () => {
  const read = vi.fn(async (path: string) => path === "value.ts" ? 'export const value = "hello";' : null);
  const analyzer = createTypeScriptAnalyzer(read);
  try {
    const content = 'import { value } from "./value"; value.to';
    await analyzer.analyze({ path: "main.ts", content });
    read.mockClear();
    await analyzer.analyze({ path: "main.ts", content, position: content.length });
    expect(read).not.toHaveBeenCalled();
    await analyzer.analyze({ path: "main.ts", content });
    expect(read).toHaveBeenCalled();
  } finally { await analyzer.dispose(); }
});

it("coalesces queued completion requests to the latest buffer", async () => {
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    const content = "const value = 42; value.to";
    const results = await Promise.all(Array.from({ length: 25 }, () => analyzer.analyze({ path: "main.ts", content, position: content.length })));
    expect(results.slice(0, -1).every((result) => "completions" in result && result.completions.length === 0)).toBe(true);
    const last = results.at(-1)!;
    expect("completions" in last && last.completions.some((item) => item.label === "toFixed")).toBe(true);
  } finally { await analyzer.dispose(); }
});

it("completes relative module paths and named exports from that module", async () => {
  const files: Record<string, string> = { "src/helpers.ts": 'export const hello = 1; export function help() {}', "src/main.ts": "" };
  const analyzer = createTypeScriptAnalyzer(async (path) => files[path] ?? null, async (path) => path === "src" ? [
    { path: "src/helpers.ts", isDir: false }, { path: "src/main.ts", isDir: false }, { path: "src/nested", isDir: true },
  ] : []);
  try {
    const content = 'import { hello } from "./he";';
    const paths = await analyzer.analyze({ path: "src/main.ts", content, position: content.indexOf('./he') + 4 });
    expect("completions" in paths && paths.completions.some((entry) => entry.label === "helpers")).toBe(true);
    const named = 'import {  } from "./helpers";';
    const exports = await analyzer.analyze({ path: "src/main.ts", content: named, position: 9 });
    expect("completions" in exports && exports.completions.map((entry) => entry.label)).toEqual(expect.arrayContaining(["hello", "help"]));
  } finally { await analyzer.dispose(); }
});
