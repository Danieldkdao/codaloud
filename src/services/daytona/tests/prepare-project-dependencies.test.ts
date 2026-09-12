import { exec } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Sandbox } from "@daytona/sdk";
import { afterEach, beforeEach, expect, it } from "vitest";
import { prepareProjectDependencies } from "@/services/daytona/prepare-project-dependencies";

const execute = promisify(exec);
let home: string;
let workspace: string;
let bin: string;
const sandbox = () => ({
  getUserHomeDir: async () => home,
  process: { executeCommand: async (command: string) => {
    try {
      const { stdout } = await execute(command, { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      return { exitCode: 0, result: stdout };
    } catch { return { exitCode: 1, result: "private registry credentials" }; }
  } },
}) as unknown as Sandbox;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-dependencies-"));
  workspace = join(home, ".codaloud/workspace");
  bin = join(home, "bin");
  await mkdir(join(workspace, ".git"), { recursive: true });
  await mkdir(bin);
  const fakeManager = `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync('install-log.jsonl',JSON.stringify(process.argv.slice(2))+'\\n');fs.mkdirSync('node_modules',{recursive:true});`;
  for (const name of ["npm", "corepack", "bun"]) {
    await writeFile(join(bin, name), fakeManager);
    await chmod(join(bin, name), 0o755);
  }
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

it("installs locked pnpm dependencies, including development declarations, without changing source manifests", async () => {
  const manifest = JSON.stringify({ devDependencies: { typescript: "5.9.3" } });
  await writeFile(join(workspace, "package.json"), manifest);
  await writeFile(join(workspace, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
  await prepareProjectDependencies(sandbox());
  expect(JSON.parse((await readFile(join(workspace, "install-log.jsonl"), "utf8")).trim())).toEqual([
    "pnpm@10.30.3", "install", "--frozen-lockfile", "--ignore-scripts", "--prod=false",
  ]);
  expect(await readFile(join(workspace, "package.json"), "utf8")).toBe(manifest);
});

it("reuses completed installs but repairs missing modules and reinstalls changed manifests", async () => {
  await writeFile(join(workspace, "package.json"), "{}");
  await prepareProjectDependencies(sandbox());
  await prepareProjectDependencies(sandbox());
  expect((await readFile(join(workspace, "install-log.jsonl"), "utf8")).trim().split("\n")).toHaveLength(1);
  await rm(join(workspace, "node_modules"), { recursive: true });
  await prepareProjectDependencies(sandbox());
  await writeFile(join(workspace, "package.json"), '{"name":"updated"}');
  await prepareProjectDependencies(sandbox());
  expect((await readFile(join(workspace, "install-log.jsonl"), "utf8")).trim().split("\n")).toHaveLength(3);
});

it("uses npm ci with a lockfile and skips repositories without package.json", async () => {
  await prepareProjectDependencies(sandbox());
  await expect(readFile(join(workspace, "install-log.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(join(workspace, "package.json"), "{}");
  await writeFile(join(workspace, "package-lock.json"), "{}");
  await prepareProjectDependencies(sandbox());
  expect(await readFile(join(workspace, "install-log.jsonl"), "utf8")).toContain('"ci","--ignore-scripts","--include=dev"');
});

it("does not mark failed installs complete or expose package-manager output", async () => {
  await writeFile(join(workspace, "package.json"), "{}");
  await writeFile(join(bin, "npm"), `#!${process.execPath}\nprocess.exit(1)`);
  await expect(prepareProjectDependencies(sandbox())).rejects.toThrow("Unable to prepare project dependencies");
  await expect(readFile(join(workspace, ".git/codaloud-dependencies.json"))).rejects.toMatchObject({ code: "ENOENT" });
});
