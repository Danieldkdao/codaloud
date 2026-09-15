import { exec, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createSandboxFile, deleteSandboxFile, readSandboxFileContent, readSandboxFiles, saveSandboxFileContent, updateSandboxFile } from "@/services/daytona/filesystem";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";

vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "server-key" } }));
const execute = promisify(exec);
const executeFile = promisify(execFile);
// bash scripts/test-daytona-filesystem.sh supplies a disposable Linux container
// on macOS. The real sandbox command then runs against Linux VFS, not a procfs mock.
const sandboxContainer = process.env.CODALOUD_TEST_SANDBOX_CONTAINER;
const contentTest = it.runIf(process.platform === "linux" || Boolean(sandboxContainer));
const context = { sandboxId: "sandbox-id", projectId: "project-id", allowInitialize: true };
let home: string;
let state: string;
let labels: Record<string, string>;
let readHook: string | undefined;
const network = vi.fn<typeof fetch>();

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "codaloud-files-")));
  if (process.platform === "darwin") {
    // Emulate GNU mv's -n -T contract on macOS using its exclusive rename syscall.
    // The production command below still runs unchanged; Linux uses real GNU mv.
    await mkdir(join(home, "bin"));
    await writeFile(join(home, "bin/mv"), `#!/usr/bin/python3
import ctypes, errno, os, sys
assert sys.argv[1:4] == ['-n', '-T', '--']
libc = ctypes.CDLL(None, use_errno=True)
result = libc.renamex_np(os.fsencode(sys.argv[4]), os.fsencode(sys.argv[5]), 4)
sys.exit(0 if result == 0 or ctypes.get_errno() == errno.EEXIST else 1)
`, { mode: 0o755 });
  }
  state = "started";
  readHook = undefined;
  labels = { codaloudApp: "codaloud", codaloudProjectId: context.projectId };
  network.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer server-key");
    if (url.pathname === "/api/sandbox/sandbox-id") {
      return Response.json({ id: context.sandboxId, state, labels, toolboxProxyUrl: "https://proxy.app.daytona.io/toolbox" });
    }
    if (url.pathname.endsWith("/start")) return Response.json({});
    if (url.pathname.endsWith("/user-home-dir")) return Response.json({ dir: home });
    if (url.pathname.endsWith("/process/execute")) {
      const body = JSON.parse(String(init?.body));
      try {
        if (readHook) await writeFile(join(home, "read-hook.cjs"), readHook);
        const environmentFile = join(home, `command-env-${randomBytes(8).toString("hex")}`);
        await writeFile(environmentFile, Object.entries(body.envs ?? {}).map(([key, value]) => `${key}=${value}`).join("\n"));
        const options = {
          timeout: 10_000,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, ...(sandboxContainer ? {} : body.envs), PATH: `${join(home, "bin")}:${process.env.PATH}`, ...(readHook ? { NODE_OPTIONS: `--require=${join(home, "read-hook.cjs")}` } : {}) },
        };
        const { stdout } = sandboxContainer
          ? await executeFile("docker", ["exec", "--env-file", environmentFile, "--env", `NODE_OPTIONS=${readHook ? `--require=${join(home, "read-hook.cjs")}` : ""}`, sandboxContainer, "sh", "-c", body.command], options)
          : await execute(body.command, options);
        return Response.json({ exitCode: 0, result: stdout });
      } catch (error) {
        const failure = error as { stdout: string };
        return Response.json({ exitCode: 1, result: failure.stdout });
      }
    }
    if (url.pathname.endsWith("/files")) {
      expect(url.searchParams.get("path")).toBe(join(home, ".codaloud/workspace"));
      expect(url.searchParams.get("depth")).toBe("1");
      return Response.json([]);
    }
    throw new Error(`Unexpected provider request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", network);
});

afterEach(async () => { await rm(home, { recursive: true, force: true }); });

contentTest.each(["", "const greeting = '你好 👋';\r\n", "\uFEFFhello\r\n"])("reads complete UTF-8 contents without changing bytes: %j", async (content) => {
  await mkdir(join(home, ".codaloud/workspace/notes"), { recursive: true });
  const path = "notes/hello ' $(echo unexpected).txt";
  await writeFile(join(home, ".codaloud/workspace", path), content);
  expect(await readSandboxFileContent(context, path)).toEqual({ path, content, size: Buffer.byteLength(content) });
});

contentTest.each(["a", "é"])("accepts text exactly at the byte limit using %j", async (character) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const content = character.repeat(MAX_PROJECT_FILE_SIZE_BYTES / Buffer.byteLength(character));
  await writeFile(join(home, ".codaloud/workspace/limit.txt"), content);
  expect(await readSandboxFileContent(context, "limit.txt")).toEqual({ path: "limit.txt", content, size: MAX_PROJECT_FILE_SIZE_BYTES });
});

contentTest("rejects an oversized file from metadata before reading any contents", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/large.txt"), "a".repeat(MAX_PROJECT_FILE_SIZE_BYTES + 1));
  readHook = `require('node:fs').readSync = () => { throw new Error('Content must not be read'); };`;
  await expect(readSandboxFileContent(context, "large.txt")).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
});

contentTest("stops at the limit plus one byte and closes the file if it grows after the size check", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const path = join(home, ".codaloud/workspace/growing.txt");
  await writeFile(path, "small");
  readHook = `
    const fs = require('node:fs');
    const stat = fs.fstatSync;
    const read = fs.readSync;
    const close = fs.closeSync;
    let total = 0;
    let target;
    fs.fstatSync = (...args) => {
      const info = stat(...args);
      if (target === undefined && info.isFile()) {
        target = args[0];
        fs.appendFileSync(${JSON.stringify(path)}, 'é'.repeat(${MAX_PROJECT_FILE_SIZE_BYTES}));
      }
      return info;
    };
    fs.readSync = (...args) => {
      const count = read(...args);
      if (args[0] === target) total += count;
      return count;
    };
    fs.closeSync = (fd) => {
      close(fd);
      if (fd === target) fs.writeFileSync(${JSON.stringify(join(home, "read-count.txt"))}, String(total));
    };
  `;
  await expect(readSandboxFileContent(context, "growing.txt")).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
  expect(Number(await readFile(join(home, "read-count.txt"), "utf8"))).toBe(MAX_PROJECT_FILE_SIZE_BYTES + 1);
});

contentTest.each([Buffer.from([0, 1, 2]), Buffer.from([0xc3, 0x28])])("rejects binary or invalid UTF-8 contents", async (content) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/data.bin"), content);
  await expect(readSandboxFileContent(context, "data.bin")).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_FILE_ENCODING" });
});

contentTest("rejects missing files, directories, and symlinks without reading outside the workspace", async () => {
  await mkdir(join(home, ".codaloud/workspace/folder"), { recursive: true });
  await writeFile(join(home, "outside.txt"), "private");
  await symlink(join(home, "outside.txt"), join(home, ".codaloud/workspace/link"));
  await symlink(home, join(home, ".codaloud/workspace/parent-link"));
  for (const [path, code] of [["missing.txt", "FILE_NOT_FOUND"], ["folder", "NOT_A_FILE"], ["link", "INVALID_PATH"], ["parent-link/outside.txt", "INVALID_PATH"]]) {
    await expect(readSandboxFileContent(context, path)).rejects.toMatchObject({ code });
  }
});

contentTest.each(
  [".codaloud", ".codaloud/workspace", ".codaloud/workspace/notes", ".codaloud/workspace/notes/nested"]
    .flatMap((directory) => ["before-directory-open", "after-directory-open", "before-file-open"].flatMap((timing) => ["read", "save"].map((operation) => ({ directory, timing, operation })))),
)("contains a $timing symlink swap at $directory during $operation, even when the path is restored", async ({ directory, timing, operation }) => {
  const relativeFile = ".codaloud/workspace/notes/nested/file.txt";
  const target = join(home, directory);
  const outside = join(home, "outside");
  const suffix = relativeFile.slice(directory.length + 1);
  await mkdir(join(home, ".codaloud/workspace/notes/nested"), { recursive: true });
  await mkdir(join(outside, suffix.slice(0, Math.max(0, suffix.lastIndexOf("/")))), { recursive: true });
  await writeFile(join(home, relativeFile), "workspace content");
  await writeFile(join(outside, suffix), "outside secret");
  readHook = `
    const fs = require('node:fs');
    const target = ${JSON.stringify(target)};
    const outside = ${JSON.stringify(outside)};
    const timing = ${JSON.stringify(timing)};
    const originalStat = fs.lstatSync;
    const originalOpen = fs.openSync;
    const expected = originalStat(target);
    let swapped = false;
    let restored = false;
    const swap = () => {
      if (swapped) return;
      fs.renameSync(target, target + '-held');
      fs.symlinkSync(outside, target);
      swapped = true;
    };
    fs.lstatSync = (path, ...args) => {
      if (timing === 'before-file-open' && String(path).endsWith('/file.txt')) swap();
      const info = originalStat(path, ...args);
      // Reproduce the vulnerable implementation's validation-to-open window.
      if (path === target && timing !== 'before-file-open') swap();
      return info;
    };
    fs.openSync = (path, flags, ...args) => {
      if (timing === 'before-directory-open' && String(path).endsWith('/' + target.split('/').pop())) swap();
      const fd = originalOpen(path, flags, ...args);
      const info = fs.fstatSync(fd);
      if (timing === 'after-directory-open' && info.dev === expected.dev && info.ino === expected.ino) swap();
      if (swapped && !restored && String(path).endsWith('/file.txt')) {
        fs.unlinkSync(target);
        fs.renameSync(target + '-held', target);
        restored = true;
      }
      return fd;
    };
    process.on('exit', () => fs.writeFileSync(${JSON.stringify(join(home, "attack-result.json"))}, JSON.stringify({ swapped, restored })));
  `;
  const result = await (operation === "read"
    ? readSandboxFileContent(context, "notes/nested/file.txt")
    : saveContent("saved", "workspace content", "notes/nested/file.txt")).catch((error: unknown) => error);
  // Either reject the changed path or finish reading the original anchored file.
  // Returning any contents from the replacement directory is a containment failure.
  if (result instanceof Error) expect(result).toMatchObject({ code: "INVALID_PATH" });
  else if (operation === "read") expect(result).toEqual({ path: "notes/nested/file.txt", content: "workspace content", size: 17 });
  else expect(result).toEqual({ path: "notes/nested/file.txt", contentHash: contentHash("saved"), size: 5 });
  const attack = JSON.parse(await readFile(join(home, "attack-result.json"), "utf8"));
  expect(attack.swapped).toBe(true);
  if (!(result instanceof Error)) expect(attack.restored).toBe(true);
  expect(await readFile(join(outside, suffix), "utf8")).toBe("outside secret");
});

contentTest.each(["symlink", "fifo", "file"].flatMap((kind) => ["read", "save"].map((operation) => ({ kind, operation }))))("rejects a file replaced with a $kind immediately before $operation", async ({ kind, operation }) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "workspace");
  await writeFile(join(home, "outside.txt"), "outside secret");
  readHook = `
    const fs = require('node:fs');
    const open = fs.openSync;
    let replaced = false;
    fs.openSync = (path, ...args) => {
      if (!replaced && String(path).endsWith('/file.txt')) {
        replaced = true;
        fs.renameSync(${JSON.stringify(target)}, ${JSON.stringify(target + "-held")});
        ${kind === "symlink"
          ? `fs.symlinkSync(${JSON.stringify(join(home, "outside.txt"))}, ${JSON.stringify(target)});`
          : kind === "fifo"
            ? `require('node:child_process').execFileSync('mkfifo', [${JSON.stringify(target)}]);`
            : `fs.writeFileSync(${JSON.stringify(target)}, 'replacement');`}
      }
      return open(path, ...args);
    };
  `;
  await expect(operation === "read" ? readSandboxFileContent(context, "file.txt") : saveContent("saved", "workspace"))
    .rejects.toMatchObject({ code: kind === "fifo" ? "NOT_A_FILE" : "INVALID_PATH" });
});

contentTest.each(["success", "deep-path", "encoding", "changed", "missing-parent", "missing-proc"])("closes every opened descriptor on %s", async (outcome) => {
  const parent = outcome === "deep-path" ? Array.from({ length: 64 }, () => "nested").join("/") : "notes";
  await mkdir(join(home, ".codaloud/workspace", parent), { recursive: true });
  const target = join(home, ".codaloud/workspace", parent, "file.txt");
  await writeFile(target, outcome === "encoding" ? Buffer.from([0xff]) : "contents");
  readHook = `
    const fs = require('node:fs');
    const open = fs.openSync;
    const close = fs.closeSync;
    const read = fs.readSync;
    const opened = new Set();
    let count = 0;
    let peak = 0;
    let changed = false;
    fs.openSync = (path, ...args) => {
      if (${JSON.stringify(outcome)} === 'missing-proc' && String(path).startsWith('/proc/self/fd/')) {
        const error = new Error('proc unavailable'); error.code = 'EACCES'; throw error;
      }
      const fd = open(path, ...args);
      opened.add(fd); count++;
      peak = Math.max(peak, opened.size);
      return fd;
    };
    fs.readSync = (...args) => {
      const count = read(...args);
      if (${JSON.stringify(outcome)} === 'changed' && !changed) {
        changed = true;
        fs.writeFileSync(${JSON.stringify(target)}, 'modified');
        fs.utimesSync(${JSON.stringify(target)}, new Date(0), new Date(0));
      }
      return count;
    };
    fs.closeSync = (fd) => { close(fd); opened.delete(fd); };
    process.on('exit', () => {
      const result = JSON.stringify({ remaining: opened.size, count, peak });
      fs.writeFileSync(${JSON.stringify(join(home, "descriptor-result.json"))}, result);
    });
  `;
  const path = outcome === "missing-parent" ? "missing/file.txt" : `${parent}/file.txt`;
  const result = await readSandboxFileContent(context, path).catch((error: unknown) => error);
  if (outcome === "success" || outcome === "deep-path") expect(result).toMatchObject({ content: "contents" });
  else if (outcome === "changed") expect(result).toMatchObject({ code: "FILE_CHANGED" });
  else expect(result).toBeInstanceOf(Error);
  const descriptors = JSON.parse(await readFile(join(home, "descriptor-result.json"), "utf8"));
  expect(descriptors.remaining).toBe(0);
  expect(descriptors.count).toBeGreaterThan(0);
  if (outcome === "deep-path") expect(descriptors.peak).toBe(2);
});

contentTest("rejects a symlink in the provider's home path", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/file.txt"), "contents");
  await symlink(home, join(home, "alias"));
  const implementation = network.getMockImplementation()!;
  network.mockImplementation((input, init) => String(input).endsWith("/user-home-dir")
    ? Promise.resolve(Response.json({ dir: join(home, "alias") }))
    : implementation(input, init));
  await expect(readSandboxFileContent(context, "file.txt")).rejects.toMatchObject({ code: "INVALID_PATH" });
});

it("fails closed on a runtime without Linux descriptor-relative access", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/file.txt"), "contents");
  readHook = `Object.defineProperty(process, 'platform', { value: 'darwin' });`;
  await expect(readSandboxFileContent(context, "file.txt")).rejects.toMatchObject({ status: 502, code: "FILESYSTEM_UNAVAILABLE" });
});

it("validates content paths before contacting Daytona", async () => {
  for (const path of ["", "/etc/passwd", "../outside", "a/../outside", "a//b", "a\\b", "a/", "a\u0000b"]) {
    await expect(readSandboxFileContent(context, path)).rejects.toThrow();
  }
  expect(network).not.toHaveBeenCalled();
});

contentTest("never initializes a missing workspace for a content read", async () => {
  await expect(readSandboxFileContent(context, "missing.txt")).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
  await expect(lstat(join(home, ".codaloud"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves workspace restoration and sandbox ownership checks for content reads", async () => {
  state = "archived";
  await expect(readSandboxFileContent(context, "file.txt")).rejects.toMatchObject({ status: 503, code: "WORKSPACE_RESTORING" });
  state = "started";
  labels.codaloudProjectId = "another-project";
  await expect(readSandboxFileContent(context, "file.txt")).rejects.toMatchObject({ code: "SANDBOX_MISMATCH" });
  expect(network.mock.calls.some(([url]) => String(url).includes("/toolbox/"))).toBe(false);
});

it.each(["file", "folder"] as const)("preserves a replacement %s created after the sandbox deletion command returns", async (kind) => {
  const input = { parentPath: "", name: "selected", kind };
  await createSandboxFile(context, input);
  const target = join(home, ".codaloud/workspace/selected");
  const replacementContent = kind === "folder" ? join(target, "keep.txt") : target;
  const implementation = network.getMockImplementation()!;
  network.mockImplementation(async (url, init) => {
    const response = await implementation(url, init);
    if (String(url).endsWith("/process/execute")) {
      // Reproduce the old validation/DELETE gap with a concurrent sandbox writer.
      if (await lstat(target).catch(() => null)) await rename(target, `${target}-moved`);
      if (kind === "folder") await mkdir(target);
      await writeFile(replacementContent, "unrelated work");
    }
    return response;
  });
  await deleteSandboxFile(context, input);
  expect(await readFile(replacementContent, "utf8")).toBe("unrelated work");
});

it("initializes a new workspace and reads an empty directory through Daytona", async () => {
  expect(await readSandboxFiles(context, "")).toEqual([]);
  expect(network.mock.calls.some(([url]) => String(url).includes("/files?"))).toBe(true);
});

it("creates empty files inside a selected folder, including literal shell characters", async () => {
  await createSandboxFile(context, { parentPath: "", name: "notes", kind: "folder" });
  const name = "hello ' $(echo unexpected).txt";
  const created = await createSandboxFile(context, { parentPath: "notes", name, kind: "file" });
  expect(created).toMatchObject({ name, path: `notes/${name}`, isDir: false, size: 0 });
  expect(await readFile(join(home, ".codaloud/workspace/notes", name), "utf8")).toBe("");
});

it("rejects concurrent duplicate creates and never overwrites existing content", async () => {
  await readSandboxFiles(context, "");
  const input = { parentPath: "", name: "hello.txt", kind: "file" as const };
  const results = await Promise.allSettled([createSandboxFile(context, input), createSandboxFile(context, input)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, code: "NAME_CONFLICT" } });
  const path = join(home, ".codaloud/workspace/hello.txt");
  await writeFile(path, "keep this");
  await expect(createSandboxFile(context, input)).rejects.toMatchObject({ status: 409 });
  await expect(createSandboxFile(context, { ...input, kind: "folder" })).rejects.toMatchObject({ status: 409 });
  expect(await readFile(path, "utf8")).toBe("keep this");
});

it("rejects symlink parents and workspace roots", async () => {
  await readSandboxFiles(context, "");
  await mkdir(join(home, "outside"));
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace/link"));
  await expect(createSandboxFile(context, { parentPath: "link", name: "escape", kind: "file" })).rejects.toMatchObject({ code: "INVALID_PATH" });
  await rm(join(home, ".codaloud/workspace"), { recursive: true });
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace"));
  await expect(readSandboxFiles(context, "")).rejects.toMatchObject({ code: "INVALID_PATH" });
});

it("does not create a replacement workspace for an unprepared import", async () => {
  await expect(readSandboxFiles({ ...context, allowInitialize: false }, "")).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
});

it.each(["stopped", "archived"])("requests restoration of a %s sandbox without executing file operations", async (nextState) => {
  state = nextState;
  await expect(readSandboxFiles(context, "")).rejects.toMatchObject({ status: 503, code: "WORKSPACE_RESTORING" });
  expect(network.mock.calls.some(([url]) => String(url).endsWith("/start"))).toBe(true);
  expect(network.mock.calls.some(([url]) => String(url).includes("/toolbox/"))).toBe(false);
});

it("refuses a mismatched sandbox before accessing its runtime", async () => {
  labels.codaloudProjectId = "another-project";
  await expect(readSandboxFiles(context, "")).rejects.toMatchObject({ status: 409 });
  expect(network).toHaveBeenCalledTimes(1);
});

it("renames a file in its parent and preserves content, including literal shell characters", async () => {
  await createSandboxFile(context, { parentPath: "", name: "notes", kind: "folder" });
  const source = join(home, ".codaloud/workspace/notes/old.txt");
  await writeFile(source, "preserve these bytes");
  const name = "new ' $(echo unexpected).txt";
  const updatedFile = await updateSandboxFile(context, { parentPath: "notes", previousName: "old.txt", name, kind: "file" });
  expect(updatedFile).toMatchObject({ name, path: `notes/${name}`, isDir: false, size: 20 });
  expect(await readFile(join(home, ".codaloud/workspace/notes", name), "utf8")).toBe("preserve these bytes");
  await expect(readFile(source)).rejects.toMatchObject({ code: "ENOENT" });
});

it("renames a nonempty folder with all descendants intact", async () => {
  await createSandboxFile(context, { parentPath: "", name: "old", kind: "folder" });
  await mkdir(join(home, ".codaloud/workspace/old/nested"));
  await writeFile(join(home, ".codaloud/workspace/old/nested/file.ts"), "contents");
  expect(await updateSandboxFile(context, { parentPath: "", previousName: "old", name: "new", kind: "folder" })).toMatchObject({ path: "new", isDir: true });
  expect(await readFile(join(home, ".codaloud/workspace/new/nested/file.ts"), "utf8")).toBe("contents");
});

it.each(["file", "folder"] as const)("allows only one concurrent %s rename to a destination", async (kind) => {
  for (const name of ["first", "second"]) {
    await createSandboxFile(context, { parentPath: "", name, kind });
    await writeFile(join(home, ".codaloud/workspace", name, ...(kind === "folder" ? ["contents.txt"] : [])), name);
  }
  const results = await Promise.allSettled(["first", "second"].map((previousName) => updateSandboxFile(context, { parentPath: "", previousName, name: "destination", kind })));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, code: "NAME_CONFLICT" } });
  const winner = results[0].status === "fulfilled" ? "first" : "second";
  const loser = winner === "first" ? "second" : "first";
  for (const [name, contents] of [["destination", winner], [loser, loser]]) {
    expect(await readFile(join(home, ".codaloud/workspace", name, ...(kind === "folder" ? ["contents.txt"] : [])), "utf8")).toBe(contents);
  }
});

it("rejects occupied destinations, including empty folders and dangling symlinks", async () => {
  await createSandboxFile(context, { parentPath: "", name: "source", kind: "folder" });
  await createSandboxFile(context, { parentPath: "", name: "occupied", kind: "folder" });
  await symlink(join(home, "missing"), join(home, ".codaloud/workspace/link"));
  for (const name of ["occupied", "link"]) {
    await expect(updateSandboxFile(context, { parentPath: "", previousName: "source", name, kind: "folder" })).rejects.toMatchObject({ status: 409, code: "NAME_CONFLICT" });
  }
});

it("reports missing or changed sources and rejects symlink sources and parents", async () => {
  await createSandboxFile(context, { parentPath: "", name: "source", kind: "file" });
  await expect(updateSandboxFile(context, { parentPath: "", previousName: "missing", name: "new", kind: "file" })).rejects.toMatchObject({ status: 404, code: "FILE_NOT_FOUND" });
  await expect(updateSandboxFile(context, { parentPath: "", previousName: "source", name: "new", kind: "folder" })).rejects.toMatchObject({ status: 409, code: "FILE_CHANGED" });
  await mkdir(join(home, "outside"));
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace/link"));
  await expect(updateSandboxFile(context, { parentPath: "", previousName: "link", name: "new", kind: "folder" })).rejects.toMatchObject({ code: "INVALID_PATH" });
  await expect(updateSandboxFile(context, { parentPath: "link", previousName: "source", name: "new", kind: "file" })).rejects.toMatchObject({ code: "INVALID_PATH" });
});

it("treats an unchanged name as a verified no-op", async () => {
  await createSandboxFile(context, { parentPath: "", name: "source", kind: "file" });
  await writeFile(join(home, ".codaloud/workspace/source"), "keep");
  expect(await updateSandboxFile(context, { parentPath: "", previousName: "source", name: "source", kind: "file" })).toMatchObject({ name: "source", size: 4 });
});

it("does not recreate a missing sandbox or mask a provider failure as an empty list", async () => {
  network.mockResolvedValue(Response.json({}, { status: 404 }));
  await expect(readSandboxFiles(context, "")).rejects.toMatchObject({ code: "SANDBOX_MISSING" });
  expect(network).toHaveBeenCalledTimes(1);
});

it("deletes only the selected file, treating shell characters as literal data", async () => {
  const name = "hello ' $(echo unexpected).txt";
  await createSandboxFile(context, { parentPath: "", name: "notes", kind: "folder" });
  const input = { parentPath: "notes", name, kind: "file" as const };
  await createSandboxFile(context, input);
  await writeFile(join(home, ".codaloud/workspace/notes/keep.txt"), "keep");
  expect(await deleteSandboxFile(context, input)).toMatchObject({ name, path: `notes/${name}`, isDir: false });
  await expect(lstat(join(home, ".codaloud/workspace/notes", name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(home, ".codaloud/workspace/notes/keep.txt"), "utf8")).toBe("keep");
  expect(network.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
});

it("recursively deletes a nonempty folder without following descendant symlinks", async () => {
  await createSandboxFile(context, { parentPath: "", name: "remove", kind: "folder" });
  await mkdir(join(home, ".codaloud/workspace/remove/nested"));
  await writeFile(join(home, ".codaloud/workspace/remove/nested/file.txt"), "delete");
  await writeFile(join(home, "outside.txt"), "keep");
  await symlink(join(home, "outside.txt"), join(home, ".codaloud/workspace/remove/link"));
  expect(await deleteSandboxFile(context, { parentPath: "", name: "remove", kind: "folder" })).toMatchObject({ path: "remove", isDir: true });
  await expect(lstat(join(home, ".codaloud/workspace/remove"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(home, "outside.txt"), "utf8")).toBe("keep");
  expect(network.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
});

it("blocks missing, changed, symlink, and escaping deletion targets before DELETE", async () => {
  await createSandboxFile(context, { parentPath: "", name: "source", kind: "file" });
  await mkdir(join(home, "outside"));
  await symlink(join(home, "outside"), join(home, ".codaloud/workspace/link"));
  for (const [input, code] of [
    [{ parentPath: "", name: "missing", kind: "file" }, "FILE_NOT_FOUND"],
    [{ parentPath: "", name: "source", kind: "folder" }, "FILE_CHANGED"],
    [{ parentPath: "", name: "link", kind: "folder" }, "INVALID_PATH"],
    [{ parentPath: "link", name: "source", kind: "file" }, "INVALID_PATH"],
  ] as const) {
    await expect(deleteSandboxFile(context, input)).rejects.toMatchObject({ code });
  }
  for (const name of ["..", ".", "", "../outside"]) {
    await expect(deleteSandboxFile(context, { parentPath: "", name, kind: "folder" })).rejects.toThrow();
  }
  expect(network.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
});

it("does not initialize a workspace for deletion and propagates provider failures", async () => {
  await expect(deleteSandboxFile(context, { parentPath: "", name: "missing", kind: "file" })).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
  await expect(lstat(join(home, ".codaloud"))).rejects.toMatchObject({ code: "ENOENT" });
  await createSandboxFile(context, { parentPath: "", name: "source", kind: "file" });
  const implementation = network.getMockImplementation()!;
  network.mockImplementation((input, init) => String(input).endsWith("/process/execute") ? Promise.resolve(Response.json({}, { status: 500 })) : implementation(input, init));
  await expect(deleteSandboxFile(context, { parentPath: "", name: "source", kind: "file" })).rejects.toMatchObject({ code: "DAYTONA_REQUEST_FAILED" });
  expect((await lstat(join(home, ".codaloud/workspace/source"))).isFile()).toBe(true);
});

const contentHash = (content: string) => createHash("sha256").update(content).digest("hex");
const saveContent = (content: string, previous = "original", path = "file.txt") =>
  saveSandboxFileContent(context, { path, content, expectedContentHash: contentHash(previous) });

contentTest.each(["", "short", "\uFEFF你好 👋\r\n", "' $(touch injected) `echo unsafe` \\ \n"])("saves exact UTF-8 bytes atomically: %j", async (content) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "original");
  await chmod(target, 0o755);
  expect(await saveContent(content)).toEqual({ path: "file.txt", size: Buffer.byteLength(content), contentHash: contentHash(content) });
  expect(await readFile(target, "utf8")).toBe(content);
  expect((await lstat(target)).mode & 0o777).toBe(0o755);
  expect(await readdir(join(home, ".codaloud/workspace"))).toEqual(["file.txt"]);
});

contentTest("saves an incompressible buffer at the editor limit without overflowing process arguments", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/file.txt"), "original");
  const content = randomBytes(MAX_PROJECT_FILE_SIZE_BYTES).toString("base64").slice(0, MAX_PROJECT_FILE_SIZE_BYTES);
  expect(await saveContent(content)).toMatchObject({ size: MAX_PROJECT_FILE_SIZE_BYTES, contentHash: contentHash(content) });
  expect(await readFile(join(home, ".codaloud/workspace/file.txt"), "utf8")).toBe(content);
});

contentTest("rejects stale saves and serializes concurrent saves across sandbox processes", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "original");
  const results = await Promise.allSettled([saveContent("first"), saveContent("second")]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "FILE_CHANGED", status: 409 } });
  const saved = await readFile(target, "utf8");
  await expect(saveContent("stale")).rejects.toMatchObject({ code: "FILE_CHANGED" });
  expect(await readFile(target, "utf8")).toBe(saved);
  expect(await saveContent("next", saved)).toMatchObject({ contentHash: contentHash("next") });
});

contentTest.each(["", "saved"])("accepts an already committed retry for %j without accepting a conflicting write", async (content) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "original");
  await saveContent(content);
  expect(await saveContent(content)).toEqual({ path: "file.txt", size: Buffer.byteLength(content), contentHash: contentHash(content) });
  await writeFile(target, "external");
  await expect(saveContent(content)).rejects.toMatchObject({ code: "FILE_CHANGED" });
  expect(await readFile(target, "utf8")).toBe("external");
});

contentTest("retries a committed replacement after directory sync failure and still requires successful sync", async () => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "original");
  readHook = `const fs = require('node:fs'); const sync = fs.fsyncSync; fs.fsyncSync = (fd) => {
    if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error('Directory sync failed'), { code: 'EIO' });
    return sync(fd);
  };`;
  await expect(saveContent("saved")).rejects.toMatchObject({ code: "FILESYSTEM_ERROR" });
  expect(await readFile(target, "utf8")).toBe("saved");
  await expect(saveContent("saved")).rejects.toMatchObject({ code: "FILESYSTEM_ERROR" });
  readHook = undefined;
  expect(await saveContent("saved")).toEqual({ path: "file.txt", size: 5, contentHash: contentHash("saved") });
  expect(await readdir(join(home, ".codaloud/workspace"))).toEqual(["file.txt"]);
});

contentTest("never creates missing files or follows file and directory symlinks when saving", async () => {
  await mkdir(join(home, ".codaloud/workspace/folder"), { recursive: true });
  await writeFile(join(home, "outside.txt"), "original");
  await symlink(join(home, "outside.txt"), join(home, ".codaloud/workspace/link"));
  await symlink(home, join(home, ".codaloud/workspace/parent-link"));
  for (const [path, code] of [["missing", "FILE_NOT_FOUND"], ["folder", "NOT_A_FILE"], ["link", "INVALID_PATH"], ["parent-link/outside.txt", "INVALID_PATH"]]) {
    await expect(saveContent("changed", "original", path)).rejects.toMatchObject({ code });
  }
  expect(await readFile(join(home, "outside.txt"), "utf8")).toBe("original");
});

contentTest.each(["ENOSPC", "EACCES"])("preserves the original and cleans temporary files after %s", async (code) => {
  await mkdir(join(home, ".codaloud/workspace"), { recursive: true });
  const target = join(home, ".codaloud/workspace/file.txt");
  await writeFile(target, "original");
  readHook = `const fs = require('node:fs'); fs.writeFileSync = () => { const e = new Error(); e.code = '${code}'; throw e; };`;
  await expect(saveContent("changed")).rejects.toMatchObject({ code: code === "ENOSPC" ? "WORKSPACE_FULL" : "FILESYSTEM_PERMISSION_DENIED" });
  expect(await readFile(target, "utf8")).toBe("original");
  expect(await readdir(join(home, ".codaloud/workspace"))).toEqual(["file.txt"]);
});

it("validates save input and preserves sandbox ownership and restoration checks", async () => {
  await expect(saveContent("changed", "original", "../outside")).rejects.toThrow();
  await expect(saveContent("é".repeat(MAX_PROJECT_FILE_SIZE_BYTES))).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
  state = "archived";
  await expect(saveContent("changed")).rejects.toMatchObject({ code: "WORKSPACE_RESTORING" });
  state = "started";
  labels.codaloudProjectId = "another-project";
  await expect(saveContent("changed")).rejects.toMatchObject({ code: "SANDBOX_MISMATCH" });
  expect(network.mock.calls.some(([url]) => String(url).includes("/toolbox/"))).toBe(false);
});

contentTest("does not initialize a missing workspace during save", async () => {
  await expect(saveContent("new")).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
  await expect(lstat(join(home, ".codaloud"))).rejects.toMatchObject({ code: "ENOENT" });
});

contentTest.each(["path", "size", "contentHash"])("rejects an unconfirmed save response with a mismatched %s", async (field) => {
  const implementation = network.getMockImplementation()!;
  network.mockImplementation((url, init) => String(url).endsWith("/process/execute")
    ? Promise.resolve(Response.json({ exitCode: 0, result: JSON.stringify({
      path: "file.txt", size: 3, contentHash: contentHash("new"),
      [field]: field === "size" ? 5 : field === "path" ? "another.txt" : contentHash("other"),
    }) }))
    : implementation(url, init));
  await expect(saveContent("new")).rejects.toMatchObject({ code: "FILESYSTEM_ERROR" });
});

it("blocks file creation and saves while a Git operation owns the workspace", async () => {
  await mkdir(join(home, ".codaloud/workspace/.git"), { recursive: true });
  await writeFile(join(home, ".codaloud/workspace/.git/codaloud-operation.lock"), "busy");
  await writeFile(join(home, ".codaloud/workspace/file.txt"), "original");
  await expect(createSandboxFile(context, { parentPath: "", name: "new.txt", kind: "file" })).rejects.toMatchObject({ code: "SAVE_BUSY", status: 409 });
  await expect(saveSandboxFileContent(context, { path: "file.txt", content: "changed", expectedContentHash: createHash("sha256").update("original").digest("hex") })).rejects.toMatchObject({ code: "SAVE_BUSY", status: 409 });
  expect(await readFile(join(home, ".codaloud/workspace/file.txt"), "utf8")).toBe("original");
  expect(await readFile(join(home, ".codaloud/workspace/.git/codaloud-operation.lock"), "utf8")).toBe("busy");
});
