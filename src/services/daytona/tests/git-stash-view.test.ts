import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitStashViewCommand } from "../git-stash-view-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
const list = (input = {}) => fixture.run(sandboxGitStashViewCommand, { projectId: "project-one", sandboxId: "sandbox-one", pageSize: 20, ...input });
it("returns an empty collection with no stash", () => { expect(list()).toEqual({ stashes: [], nextCursor: null, patch: null }); });
it("pages stash entries and previews tracked and untracked changes", () => {
  fixture.write("file.txt", "changed\n"); fixture.write("new.txt", "untracked\n");
  fixture.git("stash", "push", "-u", "-m", "First");
  const sha = fixture.git("rev-parse", "stash@{0}");
  fixture.write("file.txt", "second\n"); fixture.git("stash", "push", "-m", "Second");
  const page = list({ pageSize: 1 });
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(page.stashes[0].index).toBe(0);
  const detail = list({ index: 1, stashSha: sha });
  expect(detail.patch).toContain("untracked"); expect(detail.patch).toContain("changed");
  expect(fixture.git("stash", "list").split("\n")).toHaveLength(2);
});
it("rejects a stale stash index instead of displaying a different stash", () => {
  fixture.write("file.txt", "changed\n"); fixture.git("stash", "push");
  expect(() => list({ index: 0, stashSha: fixture.headSha })).toThrow(expect.objectContaining({ code: "GIT_STASH_CHANGED" }));
});

it("filters messages before pagination while retaining real stash indices for detail", () => {
  for (const message of ["Login oldest", "unrelated", "LOGIN newest", "another change"]) {
    fixture.write("file.txt", message + "\n");
    fixture.git("stash", "push", "-m", message);
  }
  // User date preferences must not turn reflog selectors into timestamps.
  fixture.git("config", "log.date", "iso");
  const first = list({ search: "login", pageSize: 1 });
  expect(first.stashes).toHaveLength(1);
  expect(first.stashes[0]).toMatchObject({ index: 1, message: "On main: LOGIN newest" });
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = list({ search: "login", pageSize: 1, cursor: first.nextCursor });
  expect(second.stashes).toHaveLength(1);
  expect(second.stashes[0]).toMatchObject({ index: 3, message: "On main: Login oldest" });
  expect(second.nextCursor).toBeNull();
  expect(list({ index: second.stashes[0].index, stashSha: second.stashes[0].sha }).patch).toContain("Login oldest");
  expect(list({ search: "login", pageSize: 1, cursor: first.nextCursor })).toEqual(second);
});

it("treats search as literal text and returns no matches as an empty page", () => {
  for (const message of ["fix [a].* --all $(whoami) café", "fix aaaaa", "other"]) {
    fixture.write("file.txt", message + "\n");
    fixture.git("stash", "push", "-m", message);
  }
  const page = list({ search: "[a].* --all $(whoami) CAFÉ" });
  expect(page.stashes).toHaveLength(1);
  expect(page.stashes[0].index).toBe(2);
  expect(list({ search: "missing" })).toEqual({ stashes: [], nextCursor: null, patch: null });
  expect(list({ search: "" })).toEqual(list());
});

const save = (message: string) => {
  fixture.write("file.txt", message + "\n");
  fixture.git("stash", "push", "-m", message);
  return fixture.git("rev-parse", "stash@{0}");
};

it("continues across duplicate stash SHAs without skipping entries", () => {
  const firstSha = save("first");
  save("second");
  fixture.git("stash", "store", "-m", "first again", firstSha);
  const seen = [];
  let cursor: string | undefined;
  do {
    const page = list({ pageSize: 1, cursor });
    seen.push(...page.stashes);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(seen.map((entry) => entry.index)).toEqual([0, 1, 2]);
  expect(seen[0].sha).toBe(seen[2].sha);
});

it.each(["push", "drop newest", "drop oldest", "clear"])("rejects stale pagination after %s", (operation) => {
  save("first"); save("second"); save("third");
  const page = list({ pageSize: 1 });
  if (operation === "push") save("fourth");
  else if (operation === "clear") fixture.git("stash", "clear");
  else fixture.git("stash", "drop", operation === "drop oldest" ? "stash@{2}" : "stash@{0}");
  expect(() => list({ pageSize: 1, cursor: page.nextCursor })).toThrow(expect.objectContaining({ code: "GIT_STASH_CHANGED" }));
});

it.each([{ search: "other" }, { pageSize: 2 }, { projectId: "other-project" }, { sandboxId: "other-sandbox" }])(
  "rejects cursor reuse with a different scope %j", (params) => {
    save("first"); save("second");
    const page = list({ pageSize: 1 });
    expect(() => list({ pageSize: 1, cursor: page.nextCursor, ...params })).toThrow(expect.objectContaining({ code: "INVALID_STASH_CURSOR" }));
  },
);

it.each(["invalid!", "e30", Buffer.from("null").toString("base64url")])("rejects malformed cursor %s", (cursor) => {
  expect(() => list({ cursor })).toThrow(expect.objectContaining({ code: "INVALID_STASH_CURSOR" }));
});

it("rejects a cursor whose entry anchor was altered", () => {
  save("first"); save("second");
  const first = list({ pageSize: 1 });
  const cursor = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
  cursor.afterSha = fixture.headSha;
  expect(() => list({ pageSize: 1, cursor: Buffer.from(JSON.stringify(cursor)).toString("base64url") }))
    .toThrow(expect.objectContaining({ code: "INVALID_STASH_CURSOR" }));
});

it("rejects an oversized snapshot rather than paginating a truncated list", () => {
  const sha = save("first");
  const record = `${sha} ${sha} Fixture <fixture@example.com> 1700000000 +0000\t${"x".repeat(5000)}\n`;
  fixture.write(".git/logs/refs/stash", record.repeat(900));
  expect(() => list({ pageSize: 1 })).toThrow(expect.objectContaining({ code: "GIT_RESULT_TOO_LARGE" }));
});
