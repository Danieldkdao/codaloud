import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectCommitDetailsSchema } from "@/features/projects/actions/commit-details-schemas";
import { readSandboxCommitDetails } from "@/services/daytona/commit-details";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));
const execute = promisify(execFile);
const projectId = "11111111-1111-4111-8111-111111111111";
const headers = new Headers({ cookie: "session=test" });
const project = { id: projectId, sandboxId: "sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: null };
const network = vi.fn<typeof fetch>();
let home: string;
let workspace: string;
let first: string;
let state: string;
let labels: Record<string, string>;
let transform: ((result: string) => string) | undefined;
const git = async (...args: string[]) => (await execute("git", args, { cwd: workspace })).stdout.trim();
const commit = async (message: string) => {
  await git("-c", "user.name=Committer", "-c", "user.email=committer@example.com", "commit", "--allow-empty", "--author", "Ada Example <ada@example.com>", "-m", message);
  return git("rev-parse", "HEAD");
};
const read = (sha = first, signal?: AbortSignal) => readSandboxCommitDetails(headers, projectId, sha, signal);
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-commit-details-"));
  workspace = join(home, ".codaloud/workspace");
  await mkdir(workspace, { recursive: true });
  await git("init", "-b", "main");
  await writeFile(join(workspace, "hello.txt"), "hello\n");
  await git("add", ".");
  first = await commit('Initial subject\n\nBody with "quotes", unicode 👋 and $(touch injected)');
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue(project);
  state = "started"; labels = { codaloudApp: "codaloud", codaloudProjectId: projectId }; transform = undefined;
  network.mockReset().mockImplementation(async (input, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    const url = new URL(String(input));
    if (url.pathname === "/api/sandbox/sandbox") return Response.json({ id: "sandbox", state, labels, toolboxProxyUrl: "https://toolbox.test" });
    if (url.pathname.endsWith("/start")) return Response.json({});
    if (url.pathname.endsWith("/user-home-dir")) return Response.json({ dir: home });
    if (url.pathname.endsWith("/process/execute")) {
      const body = JSON.parse(String(init?.body));
      try {
        const result = await execute("/bin/sh", ["-c", body.command], { env: { ...process.env, ...body.envs }, timeout: 15000, maxBuffer: 9 * 1024 * 1024 });
        return Response.json({ exitCode: 0, result: transform ? transform(result.stdout) : result.stdout });
      } catch (error) { return Response.json({ exitCode: 1, result: (error as { stdout: string }).stdout }); }
    }
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); vi.unstubAllGlobals(); });

it("reads a root commit with complete metadata and validated text patches", async () => {
  const result = await read();
  expect(result).toMatchObject({ source: "local", baseSha: null, githubUrl: null,
    commit: { hash: first, author: "Ada Example", authorEmail: "ada@example.com", committer: "Committer", committerEmail: "committer@example.com", parentHashes: [], isMerge: false },
    summary: { fileCount: 1, additions: 1, deletions: 0, unavailableCount: 0 },
  });
  expect(result.commit.message).toContain('unicode 👋 and $(touch injected)');
  expect(result.files[0]).toMatchObject({ path: "hello.txt", status: "added", beforeMode: "000000", afterMode: "100644", diff: { additions: 1, deletions: 0, unavailableReason: null } });
  expect(result.files[0].diff.patch).toContain("+hello\n");
  await expect(readFile(join(workspace, "injected"))).rejects.toThrow();
});

it("reads an old commit without changing HEAD, staged content, or dirty files", async () => {
  await writeFile(join(workspace, "hello.txt"), "changed\n"); await git("add", ".");
  const sha = await commit("Change greeting");
  await git("checkout", "-b", "other");
  await writeFile(join(workspace, "hello.txt"), "staged\n"); await git("add", ".");
  await writeFile(join(workspace, "hello.txt"), "dirty\n");
  const index = await readFile(join(workspace, ".git/index"));
  const result = await read(sha);
  expect(result.baseSha).toBe(first);
  expect(result.files[0].diff.patch).toContain("-hello\n+changed\n");
  expect(await git("branch", "--show-current")).toBe("other");
  expect(await readFile(join(workspace, ".git/index"))).toEqual(index);
  expect(await readFile(join(workspace, "hello.txt"), "utf8")).toBe("dirty\n");
});

it("compares merge commits against their first parent and supports empty commits", async () => {
  await git("checkout", "-b", "feature");
  await writeFile(join(workspace, "feature.txt"), "feature\n"); await git("add", ".");
  const side = await commit("Feature"); await git("checkout", "main");
  await git("-c", "user.name=Committer", "-c", "user.email=committer@example.com", "merge", "--no-ff", "feature", "-m", "Merge feature");
  const result = await read(await git("rev-parse", "HEAD"));
  expect(result.commit.parentHashes).toEqual([first, side]); expect(result.commit.isMerge).toBe(true);
  expect(result.baseSha).toBe(first); expect(result.files.map(file => file.path)).toEqual(["feature.txt"]);
  expect((await read(await commit("Empty"))).files).toEqual([]);
});

it("preserves rename identities, unusual filenames, deletion, and missing final newlines", async () => {
  const name = 'quote " tab\t newline\n $(echo injected).txt';
  await git("mv", "hello.txt", name); await writeFile(join(workspace, "new.txt"), "no newline"); await git("add", ".");
  const result = await read(await commit("Rename and add"));
  expect(result.files.find(file => file.path === name)).toMatchObject({ originalPath: "hello.txt", status: "renamed" });
  expect(result.files.find(file => file.path === "new.txt")?.diff.patch).toContain("\\ No newline at end of file");
  await git("rm", "--", name);
  expect((await read(await commit("Delete"))).files[0]).toMatchObject({ status: "deleted", afterMode: "000000" });
});

it("marks binary, oversized, and symbolic-link patches unavailable", async () => {
  await writeFile(join(workspace, "binary"), Buffer.from([0, 1, 2]));
  await writeFile(join(workspace, "large"), "a".repeat(1024 * 1024 + 1));
  await symlink("hello.txt", join(workspace, "link")); await git("add", ".");
  const result = await read(await commit("Nontext files"));
  expect(result.files.map(file => file.diff.unavailableReason)).toEqual(["binary", "too-large", "unsupported"]);
  expect(result.summary.unavailableCount).toBe(3);
});

it("does not mistake a shallow boundary for a root commit", async () => {
  const sha = await commit("Second");
  await writeFile(join(workspace, ".git/shallow"), sha + "\n");
  // Remove the loose parent commit to simulate unavailable downloaded ancestry.
  await rm(join(workspace, ".git/objects", first.slice(0, 2), first.slice(2)));
  await expect(read(sha)).rejects.toMatchObject({ status: 409, code: "COMMIT_PARENT_UNAVAILABLE" });
});

it.each(["HEAD", "abc123", "--help", "a".repeat(39), "A".repeat(40)])("rejects invalid commit identities before provider access: %s", async sha => {
  await expect(read(sha)).rejects.toMatchObject({ status: 400 }); expect(network).not.toHaveBeenCalled();
});
it("rejects missing commits and non-commit objects", async () => {
  await expect(read("f".repeat(40))).rejects.toMatchObject({ status: 404, code: "COMMIT_NOT_FOUND" });
  await expect(read(await git("rev-parse", "HEAD:hello.txt"))).rejects.toMatchObject({ status: 404, code: "COMMIT_NOT_FOUND" });
});
it("authenticates and verifies project ownership before contacting Daytona", async () => {
  mocks.user.mockResolvedValue({ userId: null }); await expect(read()).rejects.toMatchObject({ status: 401 });
  mocks.user.mockResolvedValue({ userId: "owner" }); mocks.project.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" }); expect(network).not.toHaveBeenCalled();
});
it.each([{ ...project, deletionRequested: true }, { ...project, setupStatus: "running" }, { ...project, sandboxId: null }])("rejects unavailable projects before provider access", async value => {
  mocks.project.mockResolvedValue(value); await expect(read()).rejects.toMatchObject({ status: 409 }); expect(network).not.toHaveBeenCalled();
});
it("verifies sandbox labels before executing a command", async () => {
  labels.codaloudProjectId = "another-project";
  await expect(read()).rejects.toMatchObject({ code: "SANDBOX_MISMATCH" });
  expect(network.mock.calls.some(([url]) => String(url).endsWith("/process/execute"))).toBe(false);
});
it.each(["stopped", "archived", "starting"])("preserves restoration responses for %s workspaces", async value => {
  state = value; await expect(read()).rejects.toMatchObject({ status: 503, code: "WORKSPACE_RESTORING" });
});
it.each([
  (value: ProjectCommitDetailsSchema) => { value.commit.hash = "b".repeat(40); },
  (value: ProjectCommitDetailsSchema) => { value.files[0].diff.patch = "@@ -0,0 +1,2 @@\n+incomplete\n"; },
  (value: ProjectCommitDetailsSchema) => { value.files[0].diff.additions = 9; },
  (value: ProjectCommitDetailsSchema) => { value.files.push(value.files[0]); },
])("rejects inconsistent provider results", async mutate => {
  transform = raw => { const value = JSON.parse(raw); mutate(value); return JSON.stringify(value); };
  await expect(read()).rejects.toMatchObject({ status: 502 });
});
it("rejects an already-aborted request without provider access", async () => {
  await expect(read(first, AbortSignal.abort())).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});

it("ignores repository commands, attributes, and inherited Git configuration", async () => {
  await writeFile(join(workspace, ".gitattributes"), "*.txt diff=custom filter=custom\n");
  await git("add", "."); const sha = await commit("Attributes");
  const marker = join(home, "executed");
  await git("config", "diff.custom.textconv", `touch ${marker}`);
  await git("config", "diff.external", `touch ${marker}`);
  await git("config", "filter.custom.clean", `touch ${marker}`);
  await git("config", "core.fsmonitor", `touch ${marker}`);
  vi.stubEnv("GIT_EXTERNAL_DIFF", `touch ${marker}`);
  try { await read(sha); await read(first); } finally { vi.unstubAllEnvs(); }
  await expect(readFile(marker)).rejects.toThrow();
});
it("rejects external object stores and symbolic Git directories", async () => {
  await mkdir(join(workspace, ".git/objects/info"), { recursive: true });
  await writeFile(join(workspace, ".git/objects/info/alternates"), "/other/project/objects\n");
  await expect(read()).rejects.toMatchObject({ code: "WORKSPACE_UNAVAILABLE" });
  await rm(join(workspace, ".git"), { recursive: true, force: true });
  await symlink(home, join(workspace, ".git"));
  await expect(read()).rejects.toMatchObject({ code: "WORKSPACE_UNAVAILABLE" });
});
it("supports full SHA-256 commit identities", async () => {
  await rm(join(workspace, ".git"), { recursive: true, force: true });
  await git("init", "--object-format=sha256", "-b", "main"); await git("add", ".");
  const sha = await commit("SHA-256 root"); expect(sha).toHaveLength(64);
  expect((await read(sha)).commit.hash).toBe(sha);
});
