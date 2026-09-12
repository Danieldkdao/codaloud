import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { typescriptCommand, createTypescriptCommand } from "@/services/daytona/typescript-command";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
let home: string;
let workspace: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-typescript-"));
  workspace = join(home, ".codaloud/workspace");
  await mkdir(join(workspace, "node_modules"), { recursive: true });
  await symlink(join(require.resolve("typescript"), "../.."), join(workspace, "node_modules/typescript"));
  await writeFile(join(workspace, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", skipLibCheck: true } }));
  await writeFile(join(workspace, "demo.ts"), "// saved version\n");
}, 15_000);
afterEach(async () => { await rm(home, { recursive: true, force: true }); });
const analyze = async (content: string, position?: number, path = "demo.ts") => {
  const { envs } = createTypescriptCommand({ home, path, content, position });
  const { stdout } = await execute(process.execPath, ["-e", typescriptCommand], { env: { ...process.env, ...envs }, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
};

it("checks unsaved TypeScript against imported types without writing the file", async () => {
  await writeFile(join(workspace, "options.ts"), "export type Options = { enabled: boolean };\n");
  const result = await analyze('import type { Options } from "./options";\nconst options: Options = { enabled: "yes" };');
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error", code: 2322 })]));
  expect(await readFile(join(workspace, "demo.ts"), "utf8")).toBe("// saved version\n");
}, 15_000);

it("completes imported object properties and contextual string options", async () => {
  await writeFile(join(workspace, "options.ts"), 'export type Options = { enabled: boolean; mode: "fast" | "safe" };');
  const prefix = 'import type { Options } from "./options";\ndeclare const options: Options;\n';
  const content = prefix + "options.";
  expect((await analyze(content, content.length)).completions.map((item: { label: string }) => item.label)).toContain("enabled");
  const literal = prefix + 'options.mode = ""';
  expect((await analyze(literal, literal.length - 1)).completions.map((item: { label: string }) => item.label)).toEqual(expect.arrayContaining(["fast", "safe"]));
}, 15_000);

it("uses UTF-16 offsets, reports syntax errors, and clears corrected errors", async () => {
  const content = '// 👋\r\nconst answer: number = "wrong";';
  const result = await analyze(content);
  const diagnostic = result.diagnostics.find((item: { code: number }) => item.code === 2322);
  expect(content.slice(diagnostic.from, diagnostic.to)).toBe("answer");
  expect((await analyze("const broken = ;")).diagnostics.some((item: { severity: string }) => item.severity === "error")).toBe(true);
  expect((await analyze("const answer: number = 42;")).diagnostics.filter((item: { severity: string }) => item.severity === "error")).toEqual([]);
}, 15_000);

it("rejects traversal and symlinks before reading a workspace file", async () => {
  await expect(analyze("", 0, "../outside.ts")).rejects.toThrow();
  await symlink(join(home, "outside.ts"), join(workspace, "link.ts"));
  await writeFile(join(home, "outside.ts"), "private");
  await expect(analyze("", 0, "link.ts")).rejects.toThrow();
}, 15_000);

it("checks large editor buffers without exceeding process argument limits", async () => {
  const content = "// " + "large file ".repeat(80_000) + '\nconst answer: number = "wrong";';
  const result = await analyze(content);
  expect(result.diagnostics.some((item: { code: number }) => item.code === 2322)).toBe(true);
}, 15_000);

it("resolves project path aliases with bundler module resolution", async () => {
  await writeFile(join(workspace, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    strict: true, module: "ESNext", moduleResolution: "Bundler", paths: { "@/*": ["./*"] },
  } }));
  await writeFile(join(workspace, "options.ts"), "export type Options = { enabled: boolean };");
  const content = 'import type { Options } from "@/options";\ndeclare const options: Options;\noptions.';
  expect((await analyze(content, content.length)).completions.map((item: { label: string }) => item.label)).toContain("enabled");
}, 15_000);
