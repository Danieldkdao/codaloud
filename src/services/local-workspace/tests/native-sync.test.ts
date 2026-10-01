import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
const projectId = "00000000-0000-4000-8000-000000000001";
const executable = resolve("modules/local-workspace/build-host/workspace-cli");
let base: string;
let root: string;
const call = (allowedPaths: string[] = []) =>
  JSON.parse(
    execFileSync(executable, [base], {
      input: JSON.stringify({
        projectId,
        operation: "sync-manifest",
        args: { allowedPaths },
      }),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
const hash = (content: string) =>
  createHash("sha256").update(content).digest("hex");
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "codaloud-native-sync-"));
  root = join(base, projectId);
  mkdirSync(root);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));
it("persists hashes across native processes and rechecks only the edited file even if its size and mtime are restored", () => {
  for (let i = 0; i < 1000; i++) writeFileSync(join(root, `${i}.txt`), "hello");
  const cold = call();
  expect(cold).toMatchObject({
    ok: true,
    data: { metrics: { hashed: 1000, reused: 0, bytesHashed: 5000 } },
  });
  expect(cold.data.manifest["0.txt"]).toBe(hash("hello"));
  expect(call().data.metrics).toMatchObject({
    hashed: 0,
    reused: 1000,
    bytesHashed: 0,
  });
  const path = join(root, "0.txt");
  const before = statSync(path);
  writeFileSync(path, "world");
  utimesSync(path, before.atime, before.mtime);
  const edited = call();
  expect(edited.data.metrics).toMatchObject({
    hashed: 1,
    reused: 999,
    bytesHashed: 5,
  });
  expect(edited.data.manifest["0.txt"]).toBe(hash("world"));
  writeFileSync(join(base, `.${projectId}.sync-cache.json`), "corrupt");
  expect(call().data.metrics).toMatchObject({ hashed: 1000, reused: 0 });
});
it("omits dependencies, Git and symlinks while supporting a specifically selected nested dependency folder", () => {
  for (const folder of [".git", "node_modules/one", "node_modules/two"]) {
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(join(root, folder, "a.txt"), folder);
  }
  writeFileSync(join(root, "a.txt"), "safe");
  symlinkSync(join(root, "a.txt"), join(root, "link.txt"));
  symlinkSync(base, join(root, "outside"));
  expect(call().data.manifest).toEqual({ "a.txt": hash("safe") });
  expect(call(["node_modules/one"]).data.manifest).toEqual({
    "a.txt": hash("safe"),
    "node_modules/one/a.txt": hash("node_modules/one"),
  });
  expect(call([".git"]).ok).toBe(false);
});
it("streams selected large files and detects deletions without returning file contents across the bridge", () => {
  const path = join(root, "large.bin");
  writeFileSync(path, "");
  truncateSync(path, 33 * 1024 * 1024);
  expect(call().data.manifest).toEqual({});
  const large = call(["large.bin"]);
  expect(large).toMatchObject({
    ok: true,
    data: { metrics: { hashed: 1, bytesHashed: 33 * 1024 * 1024 } },
  });
  expect(large.data.manifest["large.bin"]).toBe(
    createHash("sha256")
      .update(Buffer.alloc(33 * 1024 * 1024))
      .digest("hex"),
  );
  rmSync(path);
  expect(call(["large.bin"]).data.manifest).toEqual({});
});

it("treats malformed individual cache entries as misses", () => {
  writeFileSync(join(root, "a.txt"), "hello");
  writeFileSync(
    join(base, `.${projectId}.sync-cache.json`),
    JSON.stringify({
      version: 1,
      entries: { "a.txt": { key: { invalid: true }, hash: 42 } },
    }),
  );
  expect(call()).toMatchObject({
    ok: true,
    data: {
      manifest: { "a.txt": hash("hello") },
      metrics: { hashed: 1, reused: 0 },
    },
  });
});

it("leaves an unchanged cache untouched and removes deleted or newly excluded entries", () => {
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "a.txt"), "hello");
  writeFileSync(join(root, "node_modules", "a.txt"), "dependency");
  expect(call(["node_modules"]).data.metrics.hashed).toBe(2);
  const cachePath = join(base, `.${projectId}.sync-cache.json`);
  const before = statSync(cachePath, { bigint: true });
  expect(call(["node_modules"]).data.metrics.reused).toBe(2);
  expect(statSync(cachePath, { bigint: true }).mtimeNs).toBe(before.mtimeNs);
  expect(call().data.metrics).toMatchObject({ hashed: 0, reused: 1 });
  expect(
    Object.keys(JSON.parse(readFileSync(cachePath, "utf8")).entries),
  ).toEqual(["a.txt"]);
  rmSync(join(root, "a.txt"));
  expect(call().data.manifest).toEqual({});
  expect(JSON.parse(readFileSync(cachePath, "utf8")).entries).toEqual({});
});
