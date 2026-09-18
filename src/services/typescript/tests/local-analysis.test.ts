import { expect, it } from "vitest";
import { analyzeTypeScript } from "../analysis";
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
