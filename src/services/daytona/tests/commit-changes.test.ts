import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxCommitChangesCommand } from "../commit-changes-command";
import { createSandboxCommand } from "../create-command";

const execute = promisify(execFile);
let home: string;
let repositoryPath: string;
let headSha: string | null;
const git = async (...args: string[]) => (await execute("git", args, { cwd: repositoryPath })).stdout;
const fingerprint = async () => createHash("sha256").update(await readFile(join(repositoryPath, ".git/index"))).digest("hex");
const commit = async (overrides: Record<string, unknown> = {}, hook = "") => {
  const command = createSandboxCommand(hook + sandboxCommitChangesCommand, {
    repositoryPath, currentBranch: "main", headSha, stagedPaths: ["file.txt"], indexFingerprint: await fingerprint(),
    message: "Update file", author: { name: "Ada", email: "ada@example.com" }, ...overrides,
  }, 15);
  try {
    const { stdout } = await execute("sh", ["-c", command.command], { env: { ...process.env, ...command.envs } });
    return JSON.parse(stdout);
  } catch (error) { throw JSON.parse((error as { stdout: string }).stdout); }
};
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-commit-"));
  repositoryPath = join(home, "workspace");
  await mkdir(repositoryPath);
  await git("init", "-b", "main");
  await writeFile(join(repositoryPath, "file.txt"), "base\n");
  await git("add", ".");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Fixture");
  headSha = (await git("rev-parse", "HEAD")).trim();
  await writeFile(join(repositoryPath, "file.txt"), "staged\n");
  await git("add", "file.txt");
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

it("commits the staged snapshot with the current message and author, leaving later edits alone", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "newer edit\n");
  await writeFile(join(repositoryPath, "other.txt"), "untracked\n");
  const message = "Update 'file' $(touch should-not-run)\n\nKeep this body.";
  const result = await commit({ message });
  expect(result).toEqual({ hash: (await git("rev-parse", "HEAD")).trim(), parentHash: headSha, currentBranch: "main" });
  expect(await git("show", "HEAD:file.txt")).toBe("staged\n");
  expect(await git("log", "-1", "--format=%B")).toBe(message + "\n\n");
  expect((await git("log", "-1", "--format=%an <%ae>|%cn <%ce>")).trim()).toBe("Ada <ada@example.com>|Ada <ada@example.com>");
  expect(await readFile(join(repositoryPath, "file.txt"), "utf8")).toBe("newer edit\n");
  expect(await git("diff", "--cached", "--name-only")).toBe("");
  await expect(readFile(join(repositoryPath, "should-not-run"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("creates an initial commit on an unborn branch", async () => {
  await git("checkout", "--orphan", "initial");
  headSha = null;
  const result = await commit({ currentBranch: "initial" });
  expect(result.parentHash).toBeNull();
  expect((await git("rev-list", "--count", "HEAD")).trim()).toBe("1");
});

it.each(["index", "branch", "head", "paths", "empty"])("rejects a changed or empty %s without creating a commit", async (kind) => {
  const overrides: Record<string, unknown> = {};
  if (kind === "index") overrides.indexFingerprint = "b".repeat(64);
  if (kind === "branch") overrides.currentBranch = "other";
  if (kind === "head") overrides.headSha = "b".repeat(40);
  if (kind === "paths") overrides.stagedPaths = ["other.txt"];
  if (kind === "empty") await git("reset", "HEAD", "--", "file.txt");
  await expect(commit(overrides)).rejects.toMatchObject({ code: kind === "branch" || kind === "head" ? "WORKSPACE_CHANGED" : "COMMIT_INDEX_CHANGED" });
  expect((await git("rev-parse", "HEAD")).trim()).toBe(headSha);
});

it("rejects a repeated execution against the old HEAD", async () => {
  const inputFingerprint = await fingerprint();
  await commit();
  await expect(commit({ indexFingerprint: inputFingerprint })).rejects.toMatchObject({ code: "WORKSPACE_CHANGED" });
  expect((await git("rev-list", "--count", "HEAD")).trim()).toBe("2");
});

it.each(["index.lock", "HEAD.lock"])("respects an existing %s", async (name) => {
  await writeFile(join(repositoryPath, ".git", name), "busy");
  await expect(commit()).rejects.toMatchObject({ code: "COMMIT_BUSY" });
  expect(await readFile(join(repositoryPath, ".git", name), "utf8")).toBe("busy");
});

it("refuses an unfinished merge and keeps the selected changes staged", async () => {
  await writeFile(join(repositoryPath, ".git/MERGE_HEAD"), headSha + "\n");
  await expect(commit()).rejects.toMatchObject({ code: "COMMIT_UNRESOLVED_CONFLICTS" });
  expect((await git("diff", "--cached", "--name-only")).trim()).toBe("file.txt");
});

it("does not run repository hooks or require signing", async () => {
  await writeFile(join(repositoryPath, ".git/hooks/reference-transaction"), "#!/bin/sh\ntouch hook-ran\nexit 1\n", { mode: 0o755 });
  await git("config", "commit.gpgSign", "true");
  await commit();
  await expect(readFile(join(repositoryPath, "hook-ran"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves a competing branch update instead of overwriting it", async () => {
  const hook = `const cp = require("node:child_process"); const originalExec = cp.execFileSync;
    cp.execFileSync = (file, args, options) => {
      if (args.includes("update-ref")) {
        const alternate = originalExec("git", ["commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "Competing"], options).toString().trim();
        originalExec("git", ["-c", "core.hooksPath=/dev/null", "update-ref", "refs/heads/main", alternate], options);
      }
      return originalExec(file, args, options);
    };`;
  await expect(commit({}, hook)).rejects.toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
  expect((await git("log", "-1", "--format=%s")).trim()).toBe("Competing");
});
