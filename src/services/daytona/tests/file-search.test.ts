import { exec, execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { searchSandboxFiles } from "@/services/daytona/file-search";

vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));
const execute = promisify(exec);
const executeFile = promisify(execFile);
const container = process.env.CODALOUD_TEST_SANDBOX_CONTAINER;
const sandboxTest = it.runIf(process.platform === "linux" || Boolean(container));
const context = { sandboxId: "sandbox-id", projectId: "project-id", allowInitialize: true };
const network = vi.fn<typeof fetch>();
let home: string;
let hook: string;
let state: string;
let overrideLimits: Record<string, number>;
const search = (input: Record<string, unknown> = {}, userId = "user-id") =>
  searchSandboxFiles(context, userId, { search: "needle", ...input });
const file = async (path: string, content: string | Uint8Array) => {
  const target = join(home, ".codaloud/workspace", path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
};

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "codaloud-search-")));
  hook = "";
  state = "started";
  overrideLimits = {};
  network.mockReset().mockImplementation(async (url, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/api/sandbox/sandbox-id") return Response.json({
      id: context.sandboxId, state, labels: { codaloudApp: "codaloud", codaloudProjectId: context.projectId },
      toolboxProxyUrl: "https://proxy.daytona.test/toolbox",
    });
    if (pathname.endsWith("/start")) return Response.json({});
    if (pathname.endsWith("/user-home-dir")) return Response.json({ dir: home });
    if (!pathname.endsWith("/process/execute")) throw new Error("Unexpected request");
    const body = JSON.parse(String(init?.body));
    expect(body.timeout).toBeGreaterThan(0);
    if (Object.keys(overrideLimits).length) {
      const payload = Array.from({ length: Number(body.envs.CODALOUD_INPUT_CHUNKS) }, (_, index) => body.envs[`CODALOUD_INPUT_${index}`]).join("");
      const input = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
      Object.assign(input.limits, overrideLimits);
      body.envs = { CODALOUD_INPUT_CHUNKS: "1", CODALOUD_INPUT_0: gzipSync(JSON.stringify(input)).toString("base64") };
    }
    await writeFile(join(home, "env"), Object.entries(body.envs).map(([key, value]) => `${key}=${value}`).join("\n"));
    await writeFile(join(home, "hook.cjs"), hook);
    try {
      const options = { timeout: 15000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, ...body.envs, NODE_OPTIONS: `--require=${join(home, "hook.cjs")}` } };
      const { stdout } = container
        ? await executeFile("docker", ["exec", "--env-file", join(home, "env"), "--env", `NODE_OPTIONS=--require=${join(home, "hook.cjs")}`, container, "sh", "-c", body.command], options)
        : await execute(body.command, options);
      return Response.json({ exitCode: 0, result: stdout });
    } catch (error) { return Response.json({ exitCode: 1, result: (error as { stdout: string }).stdout }); }
  });
  vi.stubGlobal("fetch", network);
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(home, { recursive: true, force: true }); });

sandboxTest("ranks every filename match before content-only matches before paging", async () => {
  await file("needle.ts", "needle ".repeat(150));
  await file("nested/needle.ts", "needle ".repeat(101));
  await file("title-needle.ts", "no match");
  for (let index = 0; index < 13; index++) await file(`file-${index}.ts`, "needle ".repeat(index + 1));
  const first = await search();
  expect(first.files).toHaveLength(10);
  expect(first.totalCount).toBe(16);
  expect(first.files[0]).toMatchObject({ path: "needle.ts", titleMatches: true, contentMatchCount: 150 });
  expect(first.files[1]).toMatchObject({ path: "nested/needle.ts", contentMatchCount: 101 });
  expect(first.files[2]).toMatchObject({ path: "title-needle.ts", titleMatches: true, contentMatchCount: 0 });
  expect(first.nextCursor).toEqual(expect.any(String));
  // Continuations may read session JSON and file metadata, but not workspace contents.
  hook = `const fs = require('node:fs'); const read = fs.readSync; fs.readSync = (...args) => {
    if (fs.readlinkSync('/proc/self/fd/' + args[0]).includes('/workspace/')) throw new Error('rescan');
    return read(...args);
  };`;
  const second = await search({ cursor: first.nextCursor });
  expect(second.files).toHaveLength(6);
  expect(second.files.at(-1)?.path).toBe("file-0.ts");
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.files, ...second.files].map(({ path }) => path)).size).toBe(16);
  expect(await search({ cursor: first.nextCursor })).toEqual(second);
});

sandboxTest("keeps filename matches first across pages and breaks count ties by path", async () => {
  await file("a-body.ts", "needle ".repeat(200));
  await file("b-body.ts", "needle ".repeat(200));
  await file("c-body.ts", "needle");
  await file("a-needle.ts", "no match");
  await file("nested/b-NEEDLE.ts", "needle");
  await file("c-needle.ts", "needle");
  const first = await search({ pageSize: 2 });
  const second = await search({ pageSize: 2, cursor: first.nextCursor });
  const third = await search({ pageSize: 2, cursor: second.nextCursor });
  expect(first.files.map(({ path }) => path)).toEqual(["c-needle.ts", "nested/b-NEEDLE.ts"]);
  expect(second.files.map(({ path }) => path)).toEqual(["a-needle.ts", "a-body.ts"]);
  expect(third.files.map(({ path }) => path)).toEqual(["b-body.ts", "c-body.ts"]);
  expect(third.nextCursor).toBeNull();
  expect((await search({ scope: "title" })).files.map(({ path }) => path)).toEqual([
    "a-needle.ts", "c-needle.ts", "nested/b-NEEDLE.ts",
  ]);
  expect((await search({ scope: "content" })).files.map(({ path }) => path)).toEqual([
    "a-body.ts", "b-body.ts", "c-body.ts", "c-needle.ts", "nested/b-NEEDLE.ts",
  ]);
});

sandboxTest("supports title/content scopes, literal Unicode text and search rooted at a folder", async () => {
  await file("nested/needle.ts", "NEEDLE needle");
  await file("nested/body.ts", "needle");
  await file("outside.ts", "needle");
  expect((await search({ scope: "title", path: "nested" })).files.map(({ path }) => path)).toEqual(["nested/needle.ts"]);
  expect((await search({ scope: "content", path: "nested" })).files.map(({ path }) => path)).toEqual(["nested/needle.ts", "nested/body.ts"]);
  await file("literal.ts", "é [a-z] $(touch hacked) é [a-z]");
  expect((await search({ search: "[a-z]" })).files[0].contentMatchCount).toBe(2);
  expect((await search({ search: "É" })).files[0].contentMatchCount).toBe(2);
  expect((await search({ search: "$(touch hacked)" })).totalCount).toBe(1);
  expect((await readdir(home)).includes("hacked")).toBe(false);
});

sandboxTest("skips excluded directories and symlinks, reports unsupported content, and retains dotfiles", async () => {
  await file(".env", "needle");
  await file(".git/secret", "needle");
  await file("node_modules/package/index.js", "needle");
  await file("needle.bin", new Uint8Array([110, 0, 120]));
  await file("needle-large.txt", "needle".repeat(200000));
  await writeFile(join(home, "outside.txt"), "needle");
  await symlink(join(home, "outside.txt"), join(home, ".codaloud/workspace/link.txt"));
  const result = await search();
  expect(result.files.map(({ path }) => path)).toEqual(["needle-large.txt", "needle.bin", ".env"]);
  expect(result.skippedContentFiles).toBe(2);
  expect(result.files.find(({ path }) => path === "needle.bin")?.contentSearched).toBe(false);
});

sandboxTest("rejects changed workspaces, changed scope, other owners, expired and missing sessions", async () => {
  for (let index = 0; index < 12; index++) await file(`file-${index}`, "needle");
  const first = await search();
  await expect(search({ cursor: first.nextCursor, search: "other" })).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
  await expect(search({ cursor: first.nextCursor }, "another-user")).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
  await expect(search({ cursor: first.nextCursor, scope: "title" })).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
  await file("new-file", "needle");
  await expect(search({ cursor: first.nextCursor })).rejects.toMatchObject({ code: "SEARCH_WORKSPACE_CHANGED" });
  const fresh = await search();
  expect(fresh.totalCount).toBe(13);
  hook = "Date.now = () => 9999999999999;";
  await expect(search({ cursor: fresh.nextCursor })).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
});

sandboxTest("detects same-size edits even when mtime is restored", async () => {
  for (let index = 0; index < 11; index++) await file(`file-${index}`, "needle");
  const first = await search();
  const target = join(home, ".codaloud/workspace/file-0");
  const { stat } = await import("node:fs/promises");
  const previous = await stat(target);
  await writeFile(target, "xxxxxx");
  await utimes(target, previous.atime, previous.mtime);
  await expect(search({ cursor: first.nextCursor })).rejects.toMatchObject({ code: "SEARCH_WORKSPACE_CHANGED" });
});

sandboxTest("performs no content reads for title-only searches and returns complete empty results", async () => {
  await file("needle.ts", "needle");
  hook = `const fs = require('node:fs'); fs.readSync = () => { throw new Error('content read'); };`;
  expect((await search({ scope: "title" })).files[0].contentMatchCount).toBe(0);
  expect(await search({ scope: "title", search: "missing" })).toMatchObject({ files: [], totalCount: 0, nextCursor: null });
});

sandboxTest("rejects cursor tampering and page-size changes", async () => {
  for (let index = 0; index < 25; index++) await file(`file-${index}`, "needle");
  const first = await search();
  await expect(search({ cursor: first.nextCursor!.replace(":10:", ":20:") })).rejects.toMatchObject({ code: "INVALID_SEARCH_CURSOR" });
  const changedSignature = first.nextCursor!.slice(0, -1) + (first.nextCursor!.endsWith("a") ? "b" : "a");
  await expect(search({ cursor: changedSignature })).rejects.toMatchObject({ code: "INVALID_SEARCH_CURSOR" });
  await expect(search({ cursor: first.nextCursor, pageSize: 5 })).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
});

sandboxTest("bounds scans and fails explicitly instead of returning a misleading ranked subset", async () => {
  await file("one.txt", "needle");
  await file("two.txt", "needle needle");
  const limitedScans: Record<string, number>[] = [{ maxResults: 1 }, { maxEntries: 1 }, { maxContentBytes: 1 }, { maxMetadataBytes: 1 }, { maxSessionBytes: 1 }];
  for (const limits of limitedScans) {
    overrideLimits = limits;
    await expect(search({ pageSize: 1 })).rejects.toMatchObject({ code: "SEARCH_LIMIT_EXCEEDED" });
  }
  overrideLimits = {};
  hook = "let tick = 0; Date.now = () => 1700000000000 + (tick++ * 9000);";
  await expect(search()).rejects.toMatchObject({ code: "SEARCH_LIMIT_EXCEEDED" });
});

sandboxTest("bounds retained sessions and evicts the oldest without writing into the workspace", async () => {
  overrideLimits = { maxSessions: 2 };
  for (let index = 0; index < 11; index++) await file(`file-${index}`, "needle");
  const first = await search();
  await search();
  const latest = await search();
  expect(await readdir(join(home, ".codaloud/file-search"))).toHaveLength(2);
  expect(await readdir(join(home, ".codaloud/workspace"))).toHaveLength(11);
  await expect(search({ cursor: first.nextCursor })).rejects.toMatchObject({ code: "SEARCH_SESSION_EXPIRED" });
  expect((await search({ cursor: latest.nextCursor })).files).toHaveLength(1);
});

sandboxTest("rejects workspace and search-folder symlinks without exposing their targets", async () => {
  await mkdir(join(home, ".codaloud"));
  await mkdir(join(home, "outside"));
  await writeFile(join(home, "outside/needle.txt"), "needle");
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace"));
  await expect(search()).rejects.toMatchObject({ code: "INVALID_PATH" });
  await rm(join(home, ".codaloud/workspace"));
  await mkdir(join(home, ".codaloud/workspace"));
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace/link"));
  await expect(search({ path: "link" })).rejects.toMatchObject({ code: "INVALID_PATH" });
  expect(await readFile(join(home, "outside/needle.txt"), "utf8")).toBe("needle");
});

sandboxTest("initializes an empty new workspace but never recreates a missing imported workspace", async () => {
  await expect(searchSandboxFiles({ ...context, allowInitialize: false }, "user-id", { search: "needle" })).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
  expect(await search()).toMatchObject({ files: [], totalCount: 0, nextCursor: null });
  expect(await readdir(join(home, ".codaloud/workspace"))).toEqual([]);
});

it("validates search/cursor before networking and preserves restoration handling", async () => {
  for (const input of [{ search: "" }, { search: " " }, { scope: "bad" }, { path: "../outside" }, { cursor: "garbage" }, { pageSize: 1000 }]) {
    await expect(search(input)).rejects.toMatchObject({ code: "INVALID_FILE_SEARCH" });
  }
  expect(network).not.toHaveBeenCalled();
  state = "archived";
  await expect(search()).rejects.toMatchObject({ code: "WORKSPACE_RESTORING" });
});
