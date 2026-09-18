import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
let root: string;
let remote: string;
const call = (projectId: string, operation: string, args: object = {}) => JSON.parse(execFileSync(executable, [root], {
  input: JSON.stringify({ projectId, operation, args: { ...args, identity: { name: "Developer", email: "dev@example.test" } } }), encoding: "utf8",
}));
const git = (directory: string, ...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
const commit = (projectId: string, path: string, content: string) => {
  writeFileSync(join(root, projectId, path), content);
  const result = call(projectId, "git/commit", { paths: [path], message: `Update ${path}` });
  expect(result.ok).toBe(true);
  return result.data.hash as string;
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-git-remotes-"));
  remote = join(root, "remote.git");
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
  expect(call(firstId, "initialize").ok).toBe(true);
  commit(firstId, "base.txt", "base\n");
  git(join(root, firstId), "remote", "add", "origin", `file://${remote}`);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it("pushes, clones, and refreshes tracking counts with real Git repositories", () => {
  expect(call(firstId, "git/push")).toMatchObject({ ok: true, data: { pushed: true, counts: { incoming: 0, outgoing: 0 } } });
  expect(call(secondId, "clone", { url: `file://${remote}` }).ok).toBe(true);
  commit(secondId, "remote.txt", "remote change\n");
  expect(call(secondId, "git/push").ok).toBe(true);
  expect(call(firstId, "git/fetch")).toMatchObject({ ok: true, data: { incoming: 1, outgoing: 0 } });
  expect(call(firstId, "git/pull")).toMatchObject({ ok: true, data: { rebased: false, counts: { incoming: 0, outgoing: 0 } } });
  expect(git(join(root, firstId), "rev-parse", "HEAD")).toBe(git(remote, "rev-parse", "HEAD"));
});

it("rejects a stale force-push lease without overwriting the remote branch", () => {
  expect(call(firstId, "git/push").ok).toBe(true);
  const original = git(remote, "rev-parse", "HEAD");
  expect(call(secondId, "clone", { url: `file://${remote}` }).ok).toBe(true);
  const changed = commit(secondId, "other.txt", "other\n");
  expect(call(secondId, "git/push").ok).toBe(true);
  commit(firstId, "local.txt", "local\n");
  expect(call(firstId, "git/push", { force: true, expectedRemoteSha: original })).toMatchObject({ ok: false, code: "PUSH_LEASE_CHANGED" });
  expect(git(remote, "rev-parse", "HEAD")).toBe(changed);
});

it.each([false, true])("pulls diverged clean histories with rebase=%s", (rebase) => {
  expect(call(firstId, "git/push").ok).toBe(true);
  expect(call(secondId, "clone", { url: `file://${remote}` }).ok).toBe(true);
  commit(firstId, "local.txt", "local\n");
  commit(secondId, "remote.txt", "remote\n");
  expect(call(secondId, "git/push").ok).toBe(true);
  const pulled = call(firstId, "git/pull", { rebase });
  expect(pulled).toMatchObject({ ok: true, data: { rebased: rebase, currentBranch: "main" } });
  expect(git(join(root, firstId), "ls-tree", "--name-only", "HEAD")).toBe("base.txt\nlocal.txt\nremote.txt");
  expect(git(join(root, firstId), "status", "--porcelain")).toBe("");
  expect(git(join(root, firstId), "show", "--format=%P", "--no-patch", "HEAD").split(" ")).toHaveLength(rebase ? 1 : 2);
});

it("rejects unsupported hosts and credential-bearing clone URLs", () => {
  for (const url of ["https://example.com/repo.git", "https://token@github.com/owner/repo.git", "https://github.com.evil.test/owner/repo.git"]) {
    expect(call(secondId, "clone", { url })).toMatchObject({ ok: false, code: "UNSUPPORTED_REMOTE" });
  }
});

it.each([false, true])("keeps local work intact when an incoming pull conflicts, rebase=%s", (rebase) => {
  expect(call(firstId, "git/push").ok).toBe(true);
  expect(call(secondId, "clone", { url: `file://${remote}` }).ok).toBe(true);
  const local = commit(firstId, "base.txt", "local change\n");
  commit(secondId, "base.txt", "remote change\n");
  expect(call(secondId, "git/push").ok).toBe(true);
  expect(call(firstId, "git/pull", { rebase })).toMatchObject({ ok: false, code: "PULL_CONFLICT" });
  expect(git(join(root, firstId), "rev-parse", "HEAD")).toBe(local);
  expect(git(join(root, firstId), "show", "HEAD:base.txt")).toBe("local change");
  expect(git(join(root, firstId), "status", "--porcelain")).toBe("");
});

it("reads fetched remote history and branches without contacting the remote", () => {
  expect(call(firstId, "git/push").ok).toBe(true);
  const remoteHead = git(remote, "rev-parse", "HEAD");
  commit(firstId, "local-only.txt", "offline\n");
  rmSync(remote, { recursive: true });
  const history = call(firstId, "git/history", { branch: "main", source: "remote" });
  expect(history).toMatchObject({ ok: true, data: { snapshotSha: remoteHead } });
  expect(call(firstId, "git/branches", { source: "remote" }).data.branches).toEqual(["main"]);
  expect(call(firstId, "git/commit-details", { commitSha: remoteHead, source: "remote" }).data.source).toBe("remote");
});
