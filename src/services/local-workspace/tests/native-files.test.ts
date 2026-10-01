import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-000000000001";
let root: string;
const call = (operation: string, args: object = {}) => JSON.parse(execFileSync(executable, [root], {
  input: JSON.stringify({ projectId, operation, args }), encoding: "utf8",
}));
const hash = (content: string) => createHash("sha256").update(content).digest("hex");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-native-test-"));
  expect(call("initialize").ok).toBe(true);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it("creates, reads, renames, and deletes durable UTF-8 files", () => {
  expect(call("create-file", { parentPath: "", name: "src", kind: "folder" }).ok).toBe(true);
  expect(call("create-file", { parentPath: "src", name: "hello.ts", kind: "file" }).ok).toBe(true);
  const content = "const greeting = 'Olá 👋';\n";
  expect(call("save-file", { path: "src/hello.ts", content, expectedContentHash: hash("") })).toMatchObject({
    ok: true, data: { path: "src/hello.ts", contentHash: hash(content), size: Buffer.byteLength(content) },
  });
  expect(call("read-file", { path: "src/hello.ts" }).data.content).toBe(content);
  expect(call("rename-file", { parentPath: "src", previousName: "hello.ts", name: "greeting.ts", kind: "file" }).ok).toBe(true);
  expect(call("list-files", { path: "src" }).data.map((file: { name: string }) => file.name)).toEqual(["greeting.ts"]);
  expect(call("delete-file", { parentPath: "src", name: "greeting.ts", kind: "file" }).ok).toBe(true);
  expect(call("list-files", { path: "src" }).data).toEqual([]);
});

it("refuses stale saves without losing the current file", () => {
  writeFileSync(join(root, projectId, "file.txt"), "newer");
  expect(call("save-file", { path: "file.txt", content: "stale", expectedContentHash: hash("older") }))
    .toMatchObject({ ok: false, code: "FILE_CHANGED" });
  expect(readFileSync(join(root, projectId, "file.txt"), "utf8")).toBe("newer");
});

it("deletes a rollback file only while it still has the expected contents", () => {
  const path = join(root, projectId, "rollback.txt");
  writeFileSync(path, "another writer");
  expect(call("delete-file", { parentPath: "", name: "rollback.txt", kind: "file", expectedContentHash: hash("") }))
    .toMatchObject({ ok: false, code: "FILE_CHANGED" });
  expect(readFileSync(path, "utf8")).toBe("another writer");
  writeFileSync(path, "");
  expect(call("delete-file", { parentPath: "", name: "rollback.txt", kind: "file", expectedContentHash: hash("") }).ok).toBe(true);
});

it("identifies a missing folder when listing or creating a nested file", () => {
  expect(call("list-files", { path: "tests" })).toMatchObject({
    ok: false,
    code: "DIRECTORY_NOT_FOUND",
    message: expect.stringContaining("folder does not exist"),
  });
  expect(call("create-file", { parentPath: "tests", name: "test2.ts", kind: "file" })).toMatchObject({
    ok: false,
    code: "DIRECTORY_NOT_FOUND",
    message: expect.stringContaining("folder does not exist"),
  });
  expect(existsSync(join(root, projectId, "tests"))).toBe(false);
  expect(call("create-file", { parentPath: "", name: "tests", kind: "folder" }).ok).toBe(true);
  expect(call("create-file", { parentPath: "tests", name: "test2.ts", kind: "file" }).ok).toBe(true);
});

it("distinguishes a file from a missing directory", () => {
  writeFileSync(join(root, projectId, "tests"), "keep");
  expect(call("list-files", { path: "tests" })).toMatchObject({
    ok: false, code: "NOT_A_DIRECTORY",
  });
  expect(call("create-file", { parentPath: "tests", name: "test2.ts", kind: "file" })).toMatchObject({
    ok: false, code: "NOT_A_DIRECTORY",
  });
  expect(readFileSync(join(root, projectId, "tests"), "utf8")).toBe("keep");
});

it.each(["../outside", "/outside", ".git/config", "src/../secret", "src/.GIT/config"])("rejects unsafe path %s", (path) => {
  expect(call("read-file", { path }).ok).toBe(false);
  expect(call("save-file", { path, content: "bad", expectedContentHash: hash("") }).ok).toBe(false);
});

it("does not follow a file or ancestor symlink outside the workspace", () => {
  writeFileSync(join(root, "secret.txt"), "secret");
  symlinkSync(join(root, "secret.txt"), join(root, projectId, "link.txt"));
  symlinkSync(root, join(root, projectId, "outside"));
  for (const path of ["link.txt", "outside/secret.txt"]) expect(call("read-file", { path }).ok).toBe(false);
  expect(call("list-files").data).toEqual([]);
});

it("does not overwrite a destination when creating or renaming", () => {
  writeFileSync(join(root, projectId, "a.txt"), "a");
  writeFileSync(join(root, projectId, "b.txt"), "b");
  expect(call("create-file", { parentPath: "", name: "a.txt", kind: "file" }).ok).toBe(false);
  expect(call("rename-file", { parentPath: "", previousName: "a.txt", name: "b.txt", kind: "file" }).ok).toBe(false);
  expect(readFileSync(join(root, projectId, "a.txt"), "utf8")).toBe("a");
  expect(readFileSync(join(root, projectId, "b.txt"), "utf8")).toBe("b");
});

it("rejects binary data and files above the editor limit", () => {
  writeFileSync(join(root, projectId, "binary.txt"), Buffer.from([0, 255]));
  writeFileSync(join(root, projectId, "large.txt"), Buffer.alloc(1024 * 1024 + 1, 65));
  expect(call("read-file", { path: "binary.txt" }).ok).toBe(false);
  expect(call("read-file", { path: "large.txt" }).ok).toBe(false);
});

it("archives a project reversibly before metadata deletion and purges only the archive", () => {
  writeFileSync(join(root, projectId, "unsaved.txt"), "keep");
  expect(call("archive-project").ok).toBe(true);
  expect(call("read-file", { path: "unsaved.txt" }).ok).toBe(false);
  expect(call("restore-project").ok).toBe(true);
  expect(call("read-file", { path: "unsaved.txt" }).data.content).toBe("keep");
  expect(call("archive-project").ok).toBe(true);
  expect(call("purge-project").ok).toBe(true);
  expect(call("restore-project").ok).toBe(true);
  expect(call("read-file", { path: "unsaved.txt" }).ok).toBe(false);
});


it("discovers archived projects after process exit without needing their SQLite rows", () => {
  expect(call("archive-project").ok).toBe(true);
  mkdirSync(join(root, "not-a-project.deleted"));
  const linkedId = "00000000-0000-4000-8000-000000000002";
  symlinkSync(root, join(root, `${linkedId}.deleted`));
  const discover = () => JSON.parse(execFileSync(executable, [root], {
    input: JSON.stringify({ operation: "list-archived-projects" }), encoding: "utf8",
  }));
  expect(discover()).toEqual({ ok: true, data: [projectId] });
  expect(call("purge-project").ok).toBe(true);
  expect(call("purge-project").ok).toBe(true);
  expect(discover()).toEqual({ ok: true, data: [] });
  expect(existsSync(join(root, "not-a-project.deleted"))).toBe(true);
});
