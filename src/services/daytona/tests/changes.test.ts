import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readSandboxChanges } from "@/services/daytona/changes";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));

const execute = promisify(execFile);
const projectId = "11111111-1111-4111-8111-111111111111";
const headers = new Headers({ cookie: "session=test" });
const project = { id: projectId, sandboxId: "sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: "123" };
const network = vi.fn<typeof fetch>();
const sandboxContainer = process.env.CODALOUD_TEST_SANDBOX_CONTAINER;
const contentTest = it.runIf(process.platform === "linux" || Boolean(sandboxContainer));
let home: string;
let workspace: string;
let state: string;
let labels: Record<string, string>;
let hook: string | undefined;
const git = async (...args: string[]) => (await execute("git", args, { cwd: workspace })).stdout.trim();
const commit = async () => git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Fixture");
const read = () => readSandboxChanges(headers, projectId);

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "codaloud-changes-")));
  workspace = join(home, ".codaloud/workspace");
  await mkdir(workspace, { recursive: true });
  await git("init", "-b", "main");
  await writeFile(join(workspace, "file.txt"), "base\n");
  await git("add", ".");
  await commit();
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue(project);
  state = "started";
  labels = { codaloudApp: "codaloud", codaloudProjectId: projectId };
  hook = undefined;
  network.mockReset().mockImplementation(async (input, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    const url = new URL(String(input));
    if (url.pathname === "/api/sandbox/sandbox") return Response.json({ id: "sandbox", state, labels, toolboxProxyUrl: "https://toolbox.test" });
    if (url.pathname.endsWith("/start")) return Response.json({});
    if (url.pathname.endsWith("/user-home-dir")) return Response.json({ dir: home });
    if (url.pathname.endsWith("/process/execute")) {
      const body = JSON.parse(String(init?.body));
      expect(body.timeout).toBe(12);
      if (hook) await writeFile(join(home, "read-hook.cjs"), hook);
      const envFile = join(home, "command-env");
      await writeFile(envFile, Object.entries(body.envs).map(([key, value]) => `${key}=${value}`).join("\n"));
      const nodeOptions = hook ? `--require=${join(home, "read-hook.cjs")}` : "";
      try {
        const result = sandboxContainer
          ? await execute("docker", ["exec", "--env-file", envFile, "--env", `NODE_OPTIONS=${nodeOptions}`, sandboxContainer, "sh", "-c", body.command], { timeout: 15000, maxBuffer: 12 * 1024 * 1024 })
          : await execute("/bin/sh", ["-c", body.command], { env: { ...process.env, ...body.envs, NODE_OPTIONS: nodeOptions }, timeout: 15000, maxBuffer: 12 * 1024 * 1024 });
        return Response.json({ exitCode: 0, result: result.stdout });
      } catch (error) {
        return Response.json({ exitCode: 1, result: (error as { stdout: string }).stdout });
      }
    }
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); vi.unstubAllGlobals(); });

it("reads a clean checkout and detached HEAD without selecting another branch", async () => {
  const headSha = await git("rev-parse", "HEAD");
  expect(await read()).toMatchObject({ repositoryState: "ready", headSha, currentBranch: "main", isDetached: false, changes: [] });
  await git("checkout", "--detach");
  expect(await read()).toMatchObject({ headSha, currentBranch: null, isDetached: true, changes: [] });
});

contentTest("keeps staged and unstaged patches even when the net change cancels; never mutates the index", async () => {
  await writeFile(join(workspace, "file.txt"), "staged\n");
  await git("add", "file.txt");
  await writeFile(join(workspace, "file.txt"), "base\n");
  const index = await readFile(join(workspace, ".git/index"));
  const result = await read();
  expect(result.changes).toHaveLength(1);
  expect(result.changes[0]).toMatchObject({ path: "file.txt", indexStatus: "modified", worktreeStatus: "modified", staged: { additions: 1, deletions: 1 }, unstaged: { additions: 1, deletions: 1 } });
  expect(result.changes[0].staged?.patch).toContain("+staged");
  expect(result.changes[0].unstaged?.patch).toContain("-staged");
  expect(await readFile(join(workspace, ".git/index"))).toEqual(index);
  expect(await git("diff", "HEAD")).toBe("");
});

contentTest("enumerates nested untracked files and literal unusual names, excluding ignored files", async () => {
  await mkdir(join(workspace, "nested"));
  const names = ["nested/new.txt", "empty.txt", "line\nbreak.txt", ":(glob)*.txt", "quote'$(touch injected).txt"];
  for (const name of names) await writeFile(join(workspace, name), name === "empty.txt" ? "" : "new content");
  await writeFile(join(workspace, ".gitignore"), "ignored.txt\n");
  await writeFile(join(workspace, "ignored.txt"), "hidden");
  const result = await read();
  expect(result.changes.map((item) => item.path).sort()).toEqual([...names, ".gitignore"].sort());
  for (const name of names) expect(result.changes.find((item) => item.path === name)).toMatchObject({ isUntracked: true, staged: null, unstaged: { additions: name === "empty.txt" ? 0 : 1, deletions: 0, unavailableReason: null } });
  await expect(readFile(join(workspace, "injected"))).rejects.toThrow();
});

it("reads staged deletions and renames, including both rename paths", async () => {
  await git("mv", "file.txt", "renamed file.txt");
  const renamed = (await read()).changes[0];
  expect(renamed).toMatchObject({ path: "renamed file.txt", originalPath: "file.txt", indexStatus: "renamed", staged: { additions: 0, deletions: 0 }, unstaged: null });
  await git("rm", "-f", "renamed file.txt");
  expect((await read()).changes[0]).toMatchObject({ path: "file.txt", indexStatus: "deleted", staged: { additions: 0, deletions: 1 } });
});

it("distinguishes unborn and uninitialized repositories from broken imports", async () => {
  await rm(join(workspace, ".git"), { recursive: true });
  await expect(read()).rejects.toMatchObject({ code: "WORKSPACE_UNAVAILABLE" });
  mocks.project.mockResolvedValue({ ...project, githubRepositoryId: null });
  expect(await read()).toMatchObject({ repositoryState: "not-initialized", headSha: null, currentBranch: null, changes: [] });
  await expect(readFile(join(workspace, ".git/HEAD"))).rejects.toThrow();
  await git("init", "-b", "main");
  await git("add", "file.txt");
  expect(await read()).toMatchObject({ repositoryState: "unborn", headSha: null, currentBranch: "main", changes: [{ path: "file.txt", staged: { additions: 1, deletions: 0 } }] });
});

contentTest("represents binary, oversized, symlink and mode-only changes explicitly", async () => {
  await writeFile(join(workspace, "binary"), Buffer.from([0, 1, 2]));
  await writeFile(join(workspace, "large"), "x".repeat(1024 * 1024 + 1));
  await writeFile(join(home, "secret"), "outside secret");
  await symlink(join(home, "secret"), join(workspace, "link"));
  await chmod(join(workspace, "file.txt"), 0o755);
  const result = await read();
  expect(result.changes.find((item) => item.path === "binary")?.unstaged).toMatchObject({ patch: null, additions: null, unavailableReason: "binary" });
  expect(result.changes.find((item) => item.path === "large")?.unstaged).toMatchObject({ patch: null, unavailableReason: "too-large" });
  expect(result.changes.find((item) => item.path === "link")).toMatchObject({ kind: "symlink", unstaged: { patch: null, unavailableReason: "unsupported" } });
  expect(result.changes.find((item) => item.path === "file.txt")).toMatchObject({ headMode: "100644", worktreeMode: "100755", unstaged: { additions: 0, deletions: 0 } });
  expect(JSON.stringify(result)).not.toContain("outside secret");
});

it("does not run repository filters, fsmonitor hooks or external diff drivers", async () => {
  for (const key of ["core.fsmonitor", "diff.external", "filter.attack.clean", "filter.attack.process"]) await git("config", key, "touch injected");
  await writeFile(join(workspace, ".gitattributes"), "file.txt filter=attack diff=attack\n");
  await git("config", "diff.attack.textconv", "touch injected");
  // Keep only a staged change so this test also runs outside Linux.
  await git("-c", "core.fsmonitor=false", "-c", "filter.attack.clean=", "-c", "filter.attack.process=", "add", ".gitattributes");
  await read();
  await expect(readFile(join(workspace, "injected"))).rejects.toThrow();
});

it("rejects external Git directories and mismatched sandbox labels", async () => {
  await rm(join(workspace, ".git"), { recursive: true });
  await symlink(home, join(workspace, ".git"));
  await expect(read()).rejects.toMatchObject({ code: "WORKSPACE_UNAVAILABLE" });
  labels.codaloudProjectId = "other";
  await expect(read()).rejects.toMatchObject({ code: "SANDBOX_MISMATCH" });
});

it("blocks authentication, ownership and readiness failures before provider access", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  await expect(read()).rejects.toMatchObject({ status: 401 });
  mocks.user.mockResolvedValue({ userId: "owner" });
  await expect(readSandboxChanges(headers, "invalid")).rejects.toMatchObject({ status: 400 });
  mocks.project.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ status: 404 });
  mocks.project.mockResolvedValue({ ...project, setupStatus: "pending" });
  await expect(read()).rejects.toMatchObject({ code: "WORKSPACE_NOT_READY" });
  mocks.project.mockResolvedValue({ ...project, deletionRequested: true });
  await expect(read()).rejects.toMatchObject({ code: "PROJECT_DELETING" });
  expect(network).not.toHaveBeenCalled();
});

it.each(["stopped", "archived", "starting"])("preserves %s restoration behavior", async (value) => {
  state = value;
  await expect(read()).rejects.toMatchObject({ status: 503, code: "WORKSPACE_RESTORING" });
  expect(network.mock.calls.some(([url]) => String(url).endsWith("/process/execute"))).toBe(false);
});

it("rejects malformed output and aborted requests without leaking provider details", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(readSandboxChanges(headers, projectId, controller.signal)).rejects.toMatchObject({ code: "CHANGES_UNAVAILABLE" });
  expect(network).not.toHaveBeenCalled();
  const original = network.getMockImplementation()!;
  network.mockImplementation(async (url, init) => String(url).endsWith("/process/execute") ? Response.json({ exitCode: 0, result: "private provider output" }) : original(url, init));
  await expect(read()).rejects.toMatchObject({ code: "CHANGES_UNAVAILABLE" });
});

it("keeps counts unavailable for staged binary and oversized blobs, and bounds patches", async () => {
  await writeFile(join(workspace, "binary"), Buffer.from([0, 1, 2]));
  await writeFile(join(workspace, "large"), "x".repeat(1024 * 1024 + 1));
  await writeFile(join(workspace, "long-patch"), "x\n".repeat(100000));
  await git("add", ".");
  const result = await read();
  expect(result.changes.find((item) => item.path === "binary")?.staged).toEqual({ patch: null, additions: null, deletions: null, unavailableReason: "binary" });
  for (const name of ["large", "long-patch"]) expect(result.changes.find((item) => item.path === name)?.staged).toEqual({ patch: null, additions: null, deletions: null, unavailableReason: "too-large" });
});

it("reports merge conflicts without pretending an ordinary two-way diff can resolve them", async () => {
  await git("checkout", "-b", "side");
  await writeFile(join(workspace, "file.txt"), "side\n");
  await git("add", "."); await commit();
  await git("checkout", "main");
  await writeFile(join(workspace, "file.txt"), "main\n");
  await git("add", "."); await commit();
  await expect(git("-c", "user.name=Test", "-c", "user.email=test@example.com", "merge", "side")).rejects.toThrow();
  expect((await read()).changes[0]).toMatchObject({ path: "file.txt", isConflicted: true, indexStatus: "unmerged", worktreeStatus: "unmerged", staged: { unavailableReason: "conflict" }, unstaged: { unavailableReason: "conflict" } });
});

it("reports staged symlinks and gitlinks without reading their targets", async () => {
  await symlink(join(home, "secret"), join(workspace, "link"));
  await git("add", "link");
  await git("update-index", "--add", "--cacheinfo", `160000,${await git("rev-parse", "HEAD")},module`);
  const result = await read();
  expect(result.changes.find((item) => item.path === "link")).toMatchObject({ kind: "symlink", staged: { unavailableReason: "unsupported" } });
  expect(result.changes.find((item) => item.path === "module")).toMatchObject({ kind: "submodule", staged: { unavailableReason: "unsupported" } });
});

it("fails explicitly when a complete list exceeds the file limit", async () => {
  await Promise.all(Array.from({ length: 5001 }, (_, index) => writeFile(join(workspace, `new-${index}`), "")));
  await expect(read()).rejects.toMatchObject({ status: 413, code: "CHANGES_TOO_LARGE" });
});

it("detects a changed HEAD during the read", async () => {
  hook = `const cp = require('node:child_process'); const run = cp.execFileSync;
    cp.execFileSync = (file, args, options) => {
      const output = run(file, args, options);
      if (args.includes('status')) {
        run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'Changed'], { cwd: options.cwd });
      }
      return output;
    };`;
  await expect(read()).rejects.toMatchObject({ status: 409, code: "WORKSPACE_CHANGED" });
});

contentTest("reads unstaged deletions after a parent directory is removed", async () => {
  await mkdir(join(workspace, "nested"));
  await writeFile(join(workspace, "nested/deleted.txt"), "deleted\n");
  await git("add", "."); await commit();
  await rm(join(workspace, "nested"), { recursive: true });
  expect((await read()).changes[0]).toMatchObject({ path: "nested/deleted.txt", worktreeStatus: "deleted", unstaged: { additions: 0, deletions: 1 } });
});

contentTest("detects a second edit even when the file stays modified in both status reads", async () => {
  await writeFile(join(workspace, "file.txt"), "first edit\n");
  hook = `const cp = require('node:child_process'); const run = cp.execFileSync;
    cp.execFileSync = (file, args, options) => {
      try { return run(file, args, options); }
      finally {
        if (args.includes('--no-index')) require('node:fs').writeFileSync(${JSON.stringify(join(workspace, "file.txt"))}, 'second edit\\n');
      }
    };`;
  await expect(read()).rejects.toMatchObject({ status: 409, code: "WORKSPACE_CHANGED" });
});
