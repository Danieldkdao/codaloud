import ts from "../generated/compiler";
import { expect, it, vi } from "vitest";
import { analyzeTypeScript, createTypeScriptAnalyzer } from "../analysis";
vi.mock("../generated/compiler", async (original) => {
  const actual = await original<typeof import("../generated/compiler")>();
  return { default: { ...actual.default, createLanguageService: vi.fn(actual.default.createLanguageService) } };
});
const analyze = (content: string, files: Record<string, string> = {}, position?: number) => analyzeTypeScript({ path: "src/main.ts", content, position }, async (path) => files[path] ?? null);
const analyzeJavaScript = (content: string, files: Record<string, string> = {}) => analyzeTypeScript({ path: "src/main.js", content }, async (path) => files[path] ?? null);
it("reports syntax and semantic errors using bundled standard libraries offline", async () => {
  const result = await analyze('const value: number = "wrong";\nconst list: Array<string> = [];');
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).toContain("TS2322");
  expect("diagnostics" in result && result.diagnostics.every((item) => item.source === "TypeScript")).toBe(true);
  expect("diagnostics" in result && result.diagnostics.some((item) => item.message.includes("Cannot find name 'Array'"))).toBe(false);
});
it("resolves imported local declarations and tsconfig aliases", async () => {
  const result = await analyze('import { count } from "@/value"; const text: string = count;', {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] }, strict: true } }),
    "src/value.ts": "export const count = 42;",
  });
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).toContain("TS2322");
  expect("diagnostics" in result && result.diagnostics.map((item) => item.code)).not.toContain("TS2307");
});
it("offers completions from real types without fetching a compiler", async () => {
  const content = 'const value = "hello"; value.toU';
  const result = await analyze(content, {}, content.length);
  expect("completions" in result && result.completions.some((item) => item.label === "toUpperCase")).toBe(true);
});

const diagnosticCodes = (result: Awaited<ReturnType<typeof analyzeTypeScript>>) =>
  "diagnostics" in result ? result.diagnostics.map((item) => item.code) : [];

it("reports errors when missing module lookup paths outnumber actual dependencies", async () => {
  const imports = Array.from({ length: 100 }, (_, index) =>
    `import type { Item as Item${index} } from "missing-package-${index}";`,
  ).join("\n");
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    const result = await analyzer.analyze({
      path: "src/app/screens/main.ts",
      content: `${imports}\nconst answer: number = "wrong";`,
    });
    expect(diagnosticCodes(result)).toContain("TS2322");
    expect(diagnosticCodes(result)).toContain("TS2307");
  } finally {
    await analyzer.dispose();
  }
});

it("bounds dependency reads during warm diagnostic revalidation", async () => {
  let active = 0;
  let peak = 0;
  const analyzer = createTypeScriptAnalyzer(async (path) => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return /^src\/value\d+\.ts$/.test(path) ? "export const value = 42;" : null;
  });
  const input = {
    path: "src/main.ts",
    content: Array.from({ length: 12 }, (_, index) =>
      `import { value as value${index} } from "./value${index}";`,
    ).join("\n") + '\nconst answer: number = "wrong";',
  };
  try {
    await analyzer.analyze(input);
    peak = 0;
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain("TS2322");
    expect(peak).toBeLessThanOrEqual(8);
  } finally {
    await analyzer.dispose();
  }
});

it("drains an in-flight dependency batch before rejecting a failed analysis", async () => {
  let revalidating = false;
  let blockedReadStarted = false;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const analyzer = createTypeScriptAnalyzer(async (path) => {
    if (revalidating && path === "src/tsconfig.json") throw new Error("Read failed");
    if (revalidating && path === "tsconfig.json") {
      blockedReadStarted = true;
      await blocked;
    }
    return path === "src/value.ts" ? "export const value = 42;" : null;
  });
  const input = { path: "src/main.ts", content: 'import { value } from "./value"; export const answer = value;' };
  try {
    await analyzer.analyze(input);
    revalidating = true;
    let settled = false;
    const result = analyzer.analyze(input);
    void result.catch(() => { settled = true; });
    await vi.waitFor(() => expect(blockedReadStarted).toBe(true));
    expect(settled).toBe(false);
    release();
    await expect(result).rejects.toThrow("Read failed");
    revalidating = false;
    expect("diagnostics" in await analyzer.analyze(input)).toBe(true);
  } finally {
    release();
    await analyzer.dispose();
  }
});

it("updates diagnostics and completions across edits in one analysis session", async () => {
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    const input = { path: "src/main.ts", content: 'const value: number = "wrong";' };
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain("TS2322");
    expect(diagnosticCodes(await analyzer.analyze({ ...input, content: "const value: number = 42;" }))).not.toContain("TS2322");
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
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain("TS2307");
    files["src/value.ts"] = "export const count = 42;";
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain("TS2322");
    files["src/value.ts"] = 'export const count = "hello";';
    expect(diagnosticCodes(await analyzer.analyze(input))).not.toContain("TS2322");
    delete files["src/value.ts"];
    expect(diagnosticCodes(await analyzer.analyze(input))).toContain("TS2307");
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
    expect(diagnosticCodes(await analyzer.analyze(input)).filter((code) => code === "TS2322")).toHaveLength(2);
    files["tsconfig.json"] = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./lib/*"] } } });
    files["node_modules/example/package.json"] = '{"types":"string.d.ts"}';
    const codes = diagnosticCodes(await analyzer.analyze(input));
    expect(codes).not.toContain("TS2322");
    expect(codes).not.toContain("TS2307");
  } finally { await analyzer.dispose(); }
});

it("isolates workspaces and replaces the active file when switching tabs", async () => {
  const first = createTypeScriptAnalyzer(async (path) => path === "src/value.ts" ? "export const count = 42;" : null);
  const second = createTypeScriptAnalyzer(async (path) => path === "src/value.ts" ? 'export const count = "hello";' : null);
  const input = { path: "src/main.ts", content: 'import { count } from "./value"; const text: string = count;' };
  try {
    expect(diagnosticCodes(await first.analyze(input))).toContain("TS2322");
    expect(diagnosticCodes(await second.analyze(input))).not.toContain("TS2322");
    expect(diagnosticCodes(await first.analyze({ path: "src/other.ts", content: "const value: number = true;" }))).toContain("TS2322");
    expect(diagnosticCodes(await first.analyze(input))).toContain("TS2322");
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
    expect(diagnosticCodes(await good)).not.toContain("TS2322");
  } finally { await analyzer.dispose(); }
});


it("keeps the compiler warm across tab switches while replacing the active graph", async () => {
  const createService = vi.mocked(ts.createLanguageService);
  const analyzer = createTypeScriptAnalyzer(async () => null);
  try {
    for (const path of ["a.ts", "b.ts", "a.ts", "b.ts", "a.ts"]) {
      const content = path === "a.ts" ? 'const value: number = "wrong";' : "const value: number = 42;";
      const codes = diagnosticCodes(await analyzer.analyze({ path, content }));
      expect(codes.includes("TS2322")).toBe(path === "a.ts");
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

const importFixture = () => {
  const files: Record<string, string> = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "package.json": JSON.stringify({ dependencies: { "@scope/first": "1", "@scope/second": "1", "plain-package": "1" }, devDependencies: { "@tools/dev": "1" } }),
    "src/main.ts": "export const current = true;",
    "src/components/button.ts": "export const button = true;",
    "src/lib/helper.ts": "export const helper = true;",
    "src/app/index.ts": "export {};",
  };
  const read = vi.fn(async (path: string) => files[path] ?? null);
  const list = vi.fn(async (path: string) => {
    const prefix = path ? `${path}/` : "";
    const entries = new Map<string, { path: string; isDir: boolean }>();
    for (const file of Object.keys(files)) {
      if (!file.startsWith(prefix)) continue;
      const remainder = file.slice(prefix.length);
      const name = remainder.split("/")[0];
      entries.set(name, { path: `${prefix}${name}`, isDir: remainder.includes("/") });
    }
    return [...entries.values()];
  });
  return { files, read, list, analyzer: createTypeScriptAnalyzer(read, list) };
};

it("offers clean alias child names on the first request and excludes the active file", async () => {
  const { analyzer } = importFixture();
  try {
    const content = 'import x from "@/';
    const result = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect("completions" in result).toBe(true);
    if (!("completions" in result)) return;
    expect(result.completions.map((entry) => entry.label).sort()).toEqual(["app", "components", "lib"]);
    expect(result.completions.every((entry) => !entry.apply.includes("workspace") && !entry.apply.includes("src/"))).toBe(true);
  } finally { await analyzer.dispose(); }
});

it("excludes the active file from relative imports", async () => {
  const { analyzer } = importFixture();
  try {
    const content = 'import x from "./';
    const result = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect("completions" in result && result.completions.some((entry) => entry.label === "main")).toBe(false);
  } finally { await analyzer.dispose(); }
});

it("offers every declared scoped dependency even without installed node_modules", async () => {
  const { analyzer } = importFixture();
  try {
    const content = 'import x from "@';
    const result = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect("completions" in result && result.completions.map((entry) => entry.label)).toEqual(expect.arrayContaining(["@scope/first", "@scope/second", "@tools/dev"]));
  } finally { await analyzer.dispose(); }
});

it("does not load imported source graphs just to suggest module paths", async () => {
  const { analyzer, files, read } = importFixture();
  files["src/slow.ts"] = 'import "./slower"; export const slow = true;';
  files["src/slower.ts"] = 'export const slower = true;';
  try {
    const content = 'import { slow } from "./slow";\nimport x from "@/';
    const result = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect(read.mock.calls.map(([path]) => path).filter((path) => /slow(er)?\.ts$/.test(path))).toEqual([]);
    expect("completions" in result && result.completions.some((entry) => entry.label === "components")).toBe(true);
  } finally { await analyzer.dispose(); }
});

it("completes module paths while diagnostics are waiting on dependency IO", async () => {
  const { files, list } = importFixture();
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const analyzer = createTypeScriptAnalyzer(async (path) => {
    if (path === "src/slow.ts") { started(); await blocked; return "export {};"; }
    return files[path] ?? null;
  }, list);
  const diagnostics = analyzer.analyze({ path: "src/main.ts", content: 'import "./slow";' });
  try {
    await waiting;
    const content = 'import "@/';
    const completed = vi.fn();
    const completion = analyzer.analyze({ path: "src/main.ts", content, position: content.length }).then(completed);
    await vi.waitFor(() => expect(completed).toHaveBeenCalled(), { timeout: 1000 });
    await completion;
    expect(completed.mock.calls[0][0].completions.map((entry: { label: string }) => entry.label)).toContain("components");
  } finally { release(); await diagnostics; await analyzer.dispose(); }
});

it.each([
  ['import x from "@/co";', '"@/co"'],
  ['export { x } from "@/co";', '"@/co"'],
  ['const x = import("@/co");', '"@/co"'],
  ["const x = require('@/co');", "'@/co'"],
  ['import x = require("@/co");', '"@/co"'],
])("preserves the original replacement span for %s", async (content, quoted) => {
  const { analyzer } = importFixture();
  try {
    const position = content.indexOf(quoted) + quoted.length - 1;
    const result = await analyzer.analyze({ path: "src/main.ts", content, position });
    const entry = "completions" in result && result.completions.find((entry) => entry.label === "components");
    expect(entry).toBeTruthy();
    if (!entry) return;
    const inserted = content.slice(0, entry.from ?? position - 2) + entry.apply + content.slice(entry.to ?? position);
    expect(inserted).toBe(content.replace("@/co", "@/components"));
  } finally { await analyzer.dispose(); }
});

it("lists a large scoped dependency set and nested alias directories without leaking virtual paths", async () => {
  const { analyzer, files } = importFixture();
  const names = Array.from({ length: 120 }, (_, index) => `@scope/package-${index}`);
  files["package.json"] = JSON.stringify({ dependencies: Object.fromEntries(names.map((name) => [name, "1"])) });
  try {
    const content = 'import x from "@';
    const result = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect("completions" in result && result.completions.map((entry) => entry.label)).toEqual(expect.arrayContaining(names));
    const nested = 'import x from "@/components/';
    const next = await analyzer.analyze({ path: "src/main.ts", content: nested, position: nested.length });
    expect("completions" in next && next.completions.map((entry) => entry.label)).toEqual(["button"]);
  } finally { await analyzer.dispose(); }
});

it("excludes self imports through exact aliases and directory index resolution", async () => {
  const { analyzer, files } = importFixture();
  files["tsconfig.json"] = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"], "@self": ["./src/app/index.ts"] } } });
  try {
    for (const specifier of ["@/", "@self"]) {
      const content = `import x from "${specifier}`;
      const result = await analyzer.analyze({ path: "src/app/index.ts", content, position: content.length });
      expect("completions" in result && result.completions.some((entry) => entry.label === "app" || entry.label === "@self")).toBe(false);
    }
  } finally { await analyzer.dispose(); }
});

it("refreshes alias configuration and directory contents after the completion cache expires", async () => {
  const { analyzer, files } = importFixture();
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const content = 'import x from "@/';
    await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    files["tsconfig.json"] = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./lib/*"] } } });
    files["lib/fresh.ts"] = "export {};";
    now.mockReturnValue(2000);
    const next = await analyzer.analyze({ path: "src/main.ts", content, position: content.length });
    expect("completions" in next && next.completions.map((entry) => entry.label)).toEqual(["fresh"]);
  } finally { now.mockRestore(); await analyzer.dispose(); }
});

it("supports JavaScript syntax by default without implicit type-checking noise", async () => {
  const valid = await analyzeJavaScript("const value = missingName;");
  expect("diagnostics" in valid && valid.diagnostics).toEqual([]);
  const malformed = await analyzeJavaScript("const value = ;");
  expect(
    "diagnostics" in malformed &&
      malformed.diagnostics.some((item) => item.severity === "error"),
  ).toBe(true);
});

it("enables JavaScript checking for ts-check comments and safe project settings", async () => {
  const content = "/** @type {number} */\nconst value = \"wrong\";";
  const byComment = await analyzeJavaScript(`// @ts-check\n${content}`);
  expect("diagnostics" in byComment && byComment.diagnostics.map((item) => item.code)).toContain("TS2322");
  const byCommentWithDisabledProjectCheck = await analyzeJavaScript(
    `// @ts-check\n${content}`,
    { "jsconfig.json": JSON.stringify({ compilerOptions: { checkJs: false } }) },
  );
  expect(
    "diagnostics" in byCommentWithDisabledProjectCheck &&
      byCommentWithDisabledProjectCheck.diagnostics.map((item) => item.code),
  ).toContain("TS2322");
  const byConfig = await analyzeJavaScript(content, {
    "jsconfig.json": JSON.stringify({ compilerOptions: { checkJs: true } }),
  });
  expect("diagnostics" in byConfig && byConfig.diagnostics.map((item) => item.code)).toContain("TS2322");
});
