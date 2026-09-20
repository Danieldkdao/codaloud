import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-000000000001";
let root: string;
let directory: string;
const call = (operation: string, args: object = {}) => JSON.parse(execFileSync(executable, [root], {
  input: JSON.stringify({ projectId, operation, args: { ...args, identity: { name: "Developer", email: "dev@example.test" } } }), encoding: "utf8",
}));
const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
const commit = (content: string) => {
  writeFileSync(join(directory, "file.txt"), content);
  const result = call("git/commit", { paths: ["file.txt"], message: `Change ${content.trim()}` });
  expect(result.ok).toBe(true);
  return result.data.hash as string;
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-git-mutations-"));
  directory = join(root, projectId);
  expect(call("initialize").ok).toBe(true);
  commit("base\n");
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it("deletes a merged local branch without changing HEAD, files, or remote refs", () => {
  const head = git("rev-parse", "HEAD");
  git("branch", "feature/done");
  git("update-ref", "refs/remotes/origin/feature/done", head);
  writeFileSync(join(directory, "file.txt"), "unsaved working tree\n");
  expect(call("git/delete-branch", { branchName: "feature/done" })).toMatchObject({ ok: true, data: { branchName: "feature/done", deleted: true } });
  expect(git("branch", "--list", "feature/done")).toBe("");
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(git("rev-parse", "refs/remotes/origin/feature/done")).toBe(head);
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe("unsaved working tree\n");
});
it("refuses deleting the current branch, missing branches, and remote ref names", () => {
  expect(call("git/delete-branch", { branchName: "main" })).toMatchObject({ ok: false, code: "BRANCH_CHECKED_OUT" });
  expect(call("git/delete-branch", { branchName: "missing" })).toMatchObject({ ok: false, code: "BRANCH_NOT_FOUND" });
  expect(call("git/delete-branch", { branchName: "refs/remotes/origin/main" })).toMatchObject({ ok: false, code: "INVALID_BRANCH" });
});
it("preserves branches with unmerged commits", () => {
  expect(call("git/create-branch", { branchName: "feature/unfinished" }).ok).toBe(true);
  const tip = commit("unfinished\n");
  expect(call("git/checkout", { branchName: "main" }).ok).toBe(true);
  expect(call("git/delete-branch", { branchName: "feature/unfinished" })).toMatchObject({ ok: false, code: "UNMERGED_BRANCH" });
  expect(git("rev-parse", "feature/unfinished")).toBe(tip);
});
it("refuses a branch checked out in another worktree", () => {
  git("worktree", "add", "-b", "other", join(root, "other-tree"));
  expect(call("git/delete-branch", { branchName: "other" })).toMatchObject({ ok: false, code: "BRANCH_CHECKED_OUT" });
});

it("stashes tracked and untracked files, applies without dropping, and verifies drop identity", () => {
  writeFileSync(join(directory, "file.txt"), "changed\n");
  writeFileSync(join(directory, "untracked.txt"), "new\n");
  const saved = call("git/stash-save", { message: "Offline work" });
  expect(saved).toMatchObject({ ok: true, data: { created: true, remainingChanges: false } });
  expect(git("status", "--porcelain")).toBe("");
  const stashes = call("git/stashes").data;
  expect(stashes[0]).toMatchObject({ index: 0, sha: saved.data.stashSha });
  expect(stashes[0].message).toContain("Offline work");
  const selection = { stashIndex: 0, stashSha: stashes[0].sha };
  expect(call("git/stash-apply", selection)).toMatchObject({ ok: true, data: { dropped: false } });
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe("changed\n");
  expect(readFileSync(join(directory, "untracked.txt"), "utf8")).toBe("new\n");
  expect(call("git/stash-drop", { ...selection, stashSha: "a".repeat(40) }).ok).toBe(false);
  expect(call("git/stash-drop", selection).ok).toBe(true);
  expect(call("git/stashes").data).toEqual([]);
});

it("does not create a stash when the workspace is clean", () => {
  expect(call("git/stash-save")).toMatchObject({ ok: true, data: { created: false, stashSha: null } });
});

it.each(["soft", "mixed", "hard"])("undoes the latest commit using %s reset semantics", (mode) => {
  const original = git("rev-parse", "HEAD");
  const latest = commit("latest\n");
  expect(call("git/undo", { mode })).toMatchObject({ ok: true, data: { previousHeadSha: latest, headSha: original, mode } });
  expect(git("rev-parse", "HEAD")).toBe(original);
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe(mode === "hard" ? "base\n" : "latest\n");
  expect(Boolean(git("diff", "--cached", "--name-only"))).toBe(mode === "soft");
});

it("reverts the latest commit into a new commit and refuses to overwrite local work", () => {
  const latest = commit("latest\n");
  writeFileSync(join(directory, "file.txt"), "local edit\n");
  expect(call("git/revert").ok).toBe(false);
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe("local edit\n");
  writeFileSync(join(directory, "file.txt"), "latest\n");
  expect(call("git/revert")).toMatchObject({ ok: true, data: { parentHash: latest } });
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe("base\n");
  expect(git("status", "--porcelain")).toBe("");
});

it("detects binary changes after discard preview and preserves untracked files by default", () => {
  writeFileSync(join(directory, "binary.bin"), Buffer.from([0, 1]));
  writeFileSync(join(directory, "file.txt"), "edit\n");
  const first = call("git/discard-preview").data;
  writeFileSync(join(directory, "binary.bin"), Buffer.from([0, 2]));
  expect(call("git/discard", { fingerprint: first.fingerprint, confirm: true, includeUntracked: false })).toMatchObject({ ok: false, code: "DISCARD_PREVIEW_STALE" });
  const preview = call("git/discard-preview").data;
  expect(call("git/discard", { fingerprint: preview.fingerprint, confirm: true, includeUntracked: false }).ok).toBe(true);
  expect(readFileSync(join(directory, "file.txt"), "utf8")).toBe("base\n");
  expect(readFileSync(join(directory, "binary.bin"))).toEqual(Buffer.from([0, 2]));
});
