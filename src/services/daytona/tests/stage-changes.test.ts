import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxStageChangesCommand } from "../stage-changes-command";
import { createSandboxCommand } from "../create-command";

const execute = promisify(execFile);
let home: string;
let repositoryPath: string;
let headSha: string;
const git = async (...args: string[]) => (await execute("git", args, { cwd: repositoryPath })).stdout;
const stage = async (paths: string[], overrides: Record<string, unknown> = {}, hook = "") => {
  const command = createSandboxCommand(hook + sandboxStageChangesCommand, {
    repositoryPath, paths, currentBranch: "main", headSha, ...overrides,
  }, 15);
  try {
    const { stdout } = await execute("sh", ["-c", command.command], { env: { ...process.env, ...command.envs } });
    return JSON.parse(stdout);
  } catch (error) {
    throw JSON.parse((error as { stdout: string }).stdout);
  }
};
const staged = async () => (await git("diff", "--cached", "--name-only", "--no-renames", "-z")).split("\0").filter(Boolean);

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-staging-"));
  repositoryPath = join(home, "workspace");
  await mkdir(repositoryPath);
  await git("init", "-b", "main");
  await writeFile(join(repositoryPath, "file.txt"), "base\n");
  await writeFile(join(repositoryPath, "other.txt"), "other\n");
  await git("add", ".");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Fixture");
  headSha = (await git("rev-parse", "HEAD")).trim();
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

it("stages selected modifications and untracked files without committing or staging other work", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  await writeFile(join(repositoryPath, "new.txt"), "new\n");
  await writeFile(join(repositoryPath, "other.txt"), "leave unstaged\n");
  const result = await stage(["file.txt", "new.txt"]);
  expect(result).toMatchObject({ stagedPaths: ["file.txt", "new.txt"], headSha });
  expect(result.indexFingerprint).toBe(createHash("sha256").update(await readFile(join(repositoryPath, ".git/index"))).digest("hex"));
  expect(await staged()).toEqual(["file.txt", "new.txt"]);
  expect(await git("show", ":file.txt")).toBe("changed\n");
  expect((await git("rev-parse", "HEAD")).trim()).toBe(headSha);
  expect(await readFile(join(repositoryPath, "other.txt"), "utf8")).toBe("leave unstaged\n");
});

it("stages deletions and both sides of a rename, including already staged deletions", async () => {
  await rename(join(repositoryPath, "file.txt"), join(repositoryPath, "renamed.txt"));
  await rm(join(repositoryPath, "other.txt"));
  await git("add", "-A");
  expect((await stage(["file.txt", "renamed.txt", "other.txt"])).stagedPaths).toEqual(["file.txt", "other.txt", "renamed.txt"]);
});

it("treats wildcard, leading dash, quote, newline, and backslash filenames literally", async () => {
  const names = ["*.txt", "-option", "quote'file", "line\nbreak", "back\\slash"];
  for (const name of [...names, "unselected.txt"]) await writeFile(join(repositoryPath, name), "new\n");
  expect(new Set((await stage(names)).stagedPaths)).toEqual(new Set(names));
  expect(new Set(await staged())).toEqual(new Set(names));
});

it("preserves the index if another staged file is outside the selection", async () => {
  await writeFile(join(repositoryPath, "other.txt"), "staged\n");
  await git("add", "other.txt");
  await writeFile(join(repositoryPath, "file.txt"), "selected\n");
  const before = await readFile(join(repositoryPath, ".git/index"));
  await expect(stage(["file.txt"])).rejects.toMatchObject({ code: "COMMIT_UNSELECTED_STAGED_CHANGES" });
  expect(await readFile(join(repositoryPath, ".git/index"))).toEqual(before);
});

it("rejects a stale branch or HEAD without touching the index", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  await expect(stage(["file.txt"], { currentBranch: "other" })).rejects.toMatchObject({ code: "WORKSPACE_CHANGED" });
  await expect(stage(["file.txt"], { headSha: "b".repeat(40) })).rejects.toMatchObject({ code: "WORKSPACE_CHANGED" });
  expect(await staged()).toEqual([]);
});

it("rejects a partly invalid selection without staging the valid files", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  await expect(stage(["file.txt", "missing.txt"])).rejects.toMatchObject({ code: "COMMIT_SELECTION_CHANGED" });
  expect(await staged()).toEqual([]);
});

it("preserves previous staging when the selected worktree content cancels its staged change", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "staged\n");
  await git("add", "file.txt");
  await writeFile(join(repositoryPath, "file.txt"), "base\n");
  const before = await readFile(join(repositoryPath, ".git/index"));
  await expect(stage(["file.txt"])).rejects.toMatchObject({ code: "COMMIT_SELECTION_CHANGED" });
  expect(await readFile(join(repositoryPath, ".git/index"))).toEqual(before);
});

it("respects an existing Git index lock", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  await writeFile(join(repositoryPath, ".git/index.lock"), "another operation");
  await expect(stage(["file.txt"])).rejects.toMatchObject({ code: "COMMIT_STAGING_BUSY" });
  expect(await readFile(join(repositoryPath, ".git/index.lock"), "utf8")).toBe("another operation");
});

it("rejects symlinks and directory selections", async () => {
  await symlink("file.txt", join(repositoryPath, "link"));
  await mkdir(join(repositoryPath, "folder"));
  await writeFile(join(repositoryPath, "folder/new.txt"), "new");
  await expect(stage(["link"])).rejects.toMatchObject({ code: "COMMIT_UNSUPPORTED_FILE" });
  await expect(stage(["folder"])).rejects.toMatchObject({ code: "COMMIT_SELECTION_CHANGED" });
  expect(await staged()).toEqual([]);
});

it("supports an unborn branch and leaves it without a commit", async () => {
  await git("checkout", "--orphan", "initial");
  await git("rm", "-rf", ".");
  await writeFile(join(repositoryPath, "new.txt"), "first\n");
  expect(await stage(["new.txt"], { currentBranch: "initial", headSha: null })).toMatchObject({ stagedPaths: ["new.txt"], headSha: null });
  await expect(git("rev-parse", "--verify", "HEAD")).rejects.toBeDefined();
});

it("rejects content filters without running them or changing the index", async () => {
  await writeFile(join(repositoryPath, ".gitattributes"), "file.txt filter=probe\n");
  await git("config", "filter.probe.clean", "touch filter-ran; cat");
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  const before = await readFile(join(repositoryPath, ".git/index"));
  await expect(stage(["file.txt"])).rejects.toMatchObject({ code: "COMMIT_UNSUPPORTED_FILTER" });
  expect(await readFile(join(repositoryPath, ".git/index"))).toEqual(before);
  await expect(readFile(join(repositoryPath, "filter-ran"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("does not publish the temporary index when the branch changes during staging", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  const before = await readFile(join(repositoryPath, ".git/index"));
  const hook = `const cp = require("node:child_process"); const originalExec = cp.execFileSync;
    cp.execFileSync = (file, args, options) => {
      const result = originalExec(file, args, options);
      if (args.includes("add")) originalExec("git", ["symbolic-ref", "HEAD", "refs/heads/other"], { cwd: options.cwd });
      return result;
    };`;
  await expect(stage(["file.txt"], {}, hook)).rejects.toMatchObject({ code: "WORKSPACE_CHANGED" });
  expect(await readFile(join(repositoryPath, ".git/index"))).toEqual(before);
});

it("reports uncertain completion if cleanup fails after the index has been published", async () => {
  await writeFile(join(repositoryPath, "file.txt"), "changed\n");
  const hook = `const cleanupFs = require("node:fs"); const originalRm = cleanupFs.rmSync;
    cleanupFs.rmSync = (target, options) => {
      if (target.includes("codaloud-stage-")) throw new Error("cleanup failed");
      return originalRm(target, options);
    };`;
  await expect(stage(["file.txt"], {}, hook)).rejects.toMatchObject({ code: "COMMIT_STAGING_OUTCOME_UNKNOWN" });
  expect(await staged()).toEqual(["file.txt"]);
});
