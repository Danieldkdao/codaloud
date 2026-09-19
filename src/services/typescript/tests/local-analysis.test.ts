import { expect, it } from "vitest";
import { analyzeTypeScript, createTypeScriptAnalyzer } from "../analysis";
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
