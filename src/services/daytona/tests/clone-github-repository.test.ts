import { exec } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Sandbox } from "@daytona/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cloneGitHubRepository } from "@/services/daytona/clone-github-repository";

const execute = promisify(exec);
let home: string;
const input = {
  operationId: "operation-one", repositoryId: "123", branchName: "feature/import",
  cloneUrl: "https://github.com/owner/repo.git", accessToken: "private-token",
};
const clone = vi.fn();
const executeCommand = vi.fn(async (command: string) => {
  try {
    const { stdout } = await execute(command);
    return { exitCode: 0, result: stdout };
  } catch {
    return { exitCode: 1, result: "Failed" };
  }
});
const sandbox = () => ({
  getUserHomeDir: async () => home,
  git: { clone }, process: { executeCommand },
}) as unknown as Sandbox;
const root = () => join(home, ".codaloud", "workspace");

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-import-"));
  clone.mockReset().mockImplementation(async (_url: string, path: string) => {
    await mkdir(join(path, ".git"), { recursive: true });
    await writeFile(join(path, "readme.md"), "repository files");
  });
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

it("clones the selected branch with separate credentials and publishes files into the app workspace", async () => {
  await cloneGitHubRepository(sandbox(), input);
  expect(clone).toHaveBeenCalledWith(input.cloneUrl, expect.any(String), "feature/import", undefined, "x-access-token", "private-token");
  expect(await readFile(join(root(), "readme.md"), "utf8")).toBe("repository files");
  expect(JSON.stringify(executeCommand.mock.calls)).not.toContain("private-token");
  expect(await readFile(join(root(), ".git", "codaloud-import.json"), "utf8")).not.toContain("private-token");
});

it("recovers completion after a lost response without recloning or resetting user edits", async () => {
  await cloneGitHubRepository(sandbox(), input);
  await writeFile(join(root(), "readme.md"), "user edits");
  await cloneGitHubRepository(sandbox(), input);
  expect(clone).toHaveBeenCalledOnce();
  expect(await readFile(join(root(), "readme.md"), "utf8")).toBe("user edits");
});

it("isolates partial clones and retries into a fresh directory", async () => {
  clone.mockImplementationOnce(async (_url: string, path: string) => {
    await mkdir(path);
    await writeFile(join(path, "partial"), "unfinished");
    throw new Error("private-token upstream details");
  });
  const error = await cloneGitHubRepository(sandbox(), input).catch((error: Error) => error);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toMatch(/private-token|upstream details/);
  await expect(readdir(root())).rejects.toMatchObject({ code: "ENOENT" });
  await cloneGitHubRepository(sandbox(), input);
  expect(clone.mock.calls[0][1]).not.toBe(clone.mock.calls[1][1]);
  expect(await readdir(root())).not.toContain("partial");
});

it("refuses to replace an existing unrecognized workspace", async () => {
  await mkdir(root(), { recursive: true });
  await writeFile(join(root(), "saved.txt"), "keep");
  await expect(cloneGitHubRepository(sandbox(), input)).rejects.toThrow();
  expect(clone).not.toHaveBeenCalled();
  expect(await readFile(join(root(), "saved.txt"), "utf8")).toBe("keep");
});

it("refuses to reuse another operation's completed import", async () => {
  await cloneGitHubRepository(sandbox(), input);
  await expect(cloneGitHubRepository(sandbox(), { ...input, operationId: "other" })).rejects.toThrow();
  expect(clone).toHaveBeenCalledOnce();
});

it("rejects a symbolic link in the workspace base", async () => {
  await mkdir(join(home, "elsewhere"));
  await symlink(join(home, "elsewhere"), join(home, ".codaloud"));
  await expect(cloneGitHubRepository(sandbox(), input)).rejects.toThrow();
  expect(clone).not.toHaveBeenCalled();
});

it("does not publish a clone that did not produce a Git repository", async () => {
  clone.mockImplementationOnce(async (_url: string, path: string) => { await mkdir(path); });
  await expect(cloneGitHubRepository(sandbox(), input)).rejects.toThrow();
  await expect(readdir(root())).rejects.toMatchObject({ code: "ENOENT" });
});
