import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";

const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-0000000000e1";
let root: string;

const call = (operation: string, args: object = {}) =>
  JSON.parse(
    execFileSync(executable, [root], {
      input: JSON.stringify({ projectId, operation, args }),
      encoding: "utf8",
    }),
  );

/**
 * Uploads are placed by the app's JavaScript file layer, not by a native
 * workspace operation. These tests pin the contract that makes that safe: the
 * engine reads exactly what the file layer wrote, and still refuses escapes.
 */
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-upload-test-"));
  expect(call("initialize").ok).toBe(true);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it("sees files and folders the app wrote directly into the workspace", () => {
  const project = join(root, projectId);
  writeFileSync(join(project, "notes.md"), "# idea\n");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src/app.ts"), "export const a = 1;\n");
  mkdirSync(join(project, "assets/logo"), { recursive: true });
  writeFileSync(join(project, "assets/logo/mark.svg"), "<svg/>");

  const listed = call("list-files", { path: "" }).data as {
    name: string;
    isDir: boolean;
  }[];
  // Folders sort first, then files, exactly as the file browser shows them.
  expect(listed.map((entry) => entry.name)).toEqual(["assets", "src", "notes.md"]);
  expect(call("list-files", { path: "src" }).data[0]).toMatchObject({
    path: "src/app.ts",
    isDir: false,
    size: 20,
  });
  expect(call("read-file", { path: "src/app.ts" }).data.content).toBe(
    "export const a = 1;\n",
  );
});

it("can overwrite an uploaded file through the normal editor save path", () => {
  const project = join(root, projectId);
  writeFileSync(join(project, "uploaded.txt"), "from the picker");
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  expect(
    call("save-file", {
      path: "uploaded.txt",
      content: "edited in Codaloud",
      expectedContentHash: hash("from the picker"),
    }).ok,
  ).toBe(true);
  expect(call("read-file", { path: "uploaded.txt" }).data.content).toBe(
    "edited in Codaloud",
  );
});

it("refuses to read a path that climbs out of the workspace after a bad folder name", () => {
  symlinkSync(root, join(root, projectId, "outside"));
  expect(call("read-file", { path: "outside/../outside" }).ok).toBe(false);
  expect(call("list-files", { path: "outside" }).ok).toBe(false);
});

it("lists an uploaded image with its size but keeps it out of the text editor", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  writeFileSync(join(root, projectId, "shot.png"), png);
  const entry = call("list-files", { path: "" }).data.find(
    (candidate: { name: string }) => candidate.name === "shot.png",
  );
  expect(entry).toMatchObject({ isDir: false, size: png.length });
  expect(call("read-file", { path: "shot.png" })).toMatchObject({
    ok: false,
    code: "BINARY_FILE",
  });
});

it("reports an uploaded zero-byte file as an empty text document", () => {
  writeFileSync(join(root, projectId, "empty.txt"), "");
  expect(call("list-files", { path: "" }).data).toEqual([
    expect.objectContaining({ name: "empty.txt", size: 0 }),
  ]);
  expect(call("read-file", { path: "empty.txt" }).data.content).toBe("");
});
