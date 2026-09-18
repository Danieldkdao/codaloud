import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-000000000001";
const identity = { name: "Local Developer", email: "developer@example.test" };
let root: string;
let directory: string;
const call = (operation: string, args: object = {}) => JSON.parse(execFileSync(executable, [root], {
  input: JSON.stringify({ projectId, operation, args: { ...args, identity } }), encoding: "utf8",
}));
const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
const commit = (path = "one.txt", content = "first\n") => {
  writeFileSync(join(directory, path), content);
  const result = call("git/commit", { paths: [path], message: "Initial change" });
  expect(result).toMatchObject({ ok: true });
  return result.data;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-native-git-"));
  directory = join(root, projectId);
  expect(call("initialize").ok).toBe(true);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it("initializes a local main branch and reads unborn counts without a remote", () => {
  expect(call("git/counts")).toMatchObject({ ok: true, data: {
    currentBranch: "main", headSha: null, upstream: null, outgoing: null, incoming: null,
  } });
  expect(git("symbolic-ref", "--short", "HEAD")).toBe("main");
});

it("commits selected working files while preserving unrelated staged entries", () => {
  writeFileSync(join(directory, "other.txt"), "staged\n");
  git("add", "other.txt");
  const created = commit();
  expect(created).toMatchObject({ currentBranch: "main", parentHash: null });
  expect(git("show", "HEAD:one.txt")).toBe("first");
  expect(git("ls-tree", "--name-only", "HEAD")).toBe("one.txt");
  expect(git("diff", "--cached", "--name-only")).toBe("other.txt");
  expect(call("git/counts").data.headSha).toBe(created.hash);
});

it("commits deletion and rejects an unchanged selection", () => {
  const first = commit();
  expect(call("git/commit", { paths: ["one.txt"], message: "No changes" })).toMatchObject({ ok: false, code: "NO_CHANGES" });
  rmSync(join(directory, "one.txt"));
  const result = call("git/commit", { paths: ["one.txt"], message: "Remove file" });
  expect(result).toMatchObject({ ok: true, data: { parentHash: first.hash } });
  expect(git("ls-tree", "--name-only", "HEAD")).toBe("");
});

it("commits a selected rename as one change without retaining the old path", () => {
  commit();
  renameSync(join(directory, "one.txt"), join(directory, "renamed.txt"));
  expect(call("git/commit", { paths: ["renamed.txt"], message: "Rename" }).ok).toBe(true);
  expect(git("ls-tree", "--name-only", "HEAD")).toBe("renamed.txt");
  expect(git("status", "--porcelain")).toBe("");
});

it("commits a symlink as a link without reading its target", () => {
  writeFileSync(join(root, "secret.txt"), "private outside content");
  symlinkSync("../secret.txt", join(directory, "link.txt"));
  expect(call("git/commit", { paths: ["link.txt"], message: "Add symbolic link" }).ok).toBe(true);
  expect(git("show", "HEAD:link.txt")).toBe("../secret.txt");
  expect(git("ls-tree", "HEAD")).toMatch(/^120000 blob/);
});

it("creates and checks out branches with immediately refreshed counts", () => {
  const created = commit();
  expect(call("git/create-branch", { branchName: "feature/local" })).toMatchObject({ ok: true, data: {
    previousBranch: "main", currentBranch: "feature/local", headSha: created.hash,
  } });
  expect(call("git/counts").data.currentBranch).toBe("feature/local");
  expect(call("git/checkout", { branchName: "main" }).ok).toBe(true);
  expect(call("git/branches").data.branches).toEqual(["feature/local", "main"]);
});

it("refuses a checkout that would overwrite working changes", () => {
  commit();
  expect(call("git/create-branch", { branchName: "other" }).ok).toBe(true);
  commit("one.txt", "other branch\n");
  expect(call("git/checkout", { branchName: "main" }).ok).toBe(true);
  writeFileSync(join(directory, "one.txt"), "unsaved elsewhere\n");
  expect(call("git/checkout", { branchName: "other" }).ok).toBe(false);
  expect(readFileSync(join(directory, "one.txt"), "utf8")).toBe("unsaved elsewhere\n");
  expect(git("branch", "--show-current")).toBe("main");
});

it("rejects detached commits and unsafe branch names without changing HEAD", () => {
  const created = commit();
  for (const branchName of ["../other", "--force", "refs/heads/other"]) {
    expect(call("git/create-branch", { branchName }).ok).toBe(false);
  }
  git("checkout", "--quiet", "--detach", created.hash);
  writeFileSync(join(directory, "one.txt"), "change\n");
  expect(call("git/commit", { paths: ["one.txt"], message: "Detached" })).toMatchObject({ ok: false, code: "DETACHED_HEAD" });
  expect(git("rev-parse", "HEAD")).toBe(created.hash);
});
