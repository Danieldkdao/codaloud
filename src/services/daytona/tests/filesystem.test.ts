import { exec } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createSandboxFile, readSandboxFiles } from "@/services/daytona/filesystem";

vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "server-key" } }));
const execute = promisify(exec);
const context = { sandboxId: "sandbox-id", projectId: "project-id", allowInitialize: true };
let home: string;
let state: string;
let labels: Record<string, string>;
const network = vi.fn<typeof fetch>();

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "codaloud-files-")));
  state = "started";
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
        const { stdout } = await execute(body.command, { timeout: 10_000 });
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

it("does not recreate a missing sandbox or mask a provider failure as an empty list", async () => {
  network.mockResolvedValue(Response.json({}, { status: 404 }));
  await expect(readSandboxFiles(context, "")).rejects.toMatchObject({ code: "SANDBOX_MISSING" });
  expect(network).toHaveBeenCalledTimes(1);
});
