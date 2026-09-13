import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readSandboxCommits } from "@/services/daytona/commits";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key", COMMIT_CURSOR_SIGNING_SECRET: "test-secret-for-commit-cursors-123456" } }));

const execute = promisify(execFile);
const projectId = "11111111-1111-4111-8111-111111111111";
const headers = new Headers({ cookie: "session=test" });
const project = { id: projectId, sandboxId: "sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: "123" };
const network = vi.fn<typeof fetch>();
let home: string;
let workspace: string;
let state: string;
let labels: Record<string, string>;
const git = async (...args: string[]) => (await execute("git", args, { cwd: workspace })).stdout.trim();
const commit = async (message: string, author = "Ada Example <ada@example.com>") => {
  await git("-c", "user.name=Committer", "-c", "user.email=committer@example.com", "commit", "--allow-empty", "--author", author, "-m", message);
  return git("rev-parse", "HEAD");
};
const read = (params: Record<string, unknown> = {}) => readSandboxCommits(headers, projectId, { branch: "main", ...params });

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codaloud-commits-"));
  workspace = join(home, ".codaloud/workspace");
  await mkdir(workspace, { recursive: true });
  await git("init", "-b", "main");
  await commit("Initial commit");
  await commit('Login validation\n\nMultiline body with "quotes", commas, | and $(touch injected).');
  await commit("Latest change", "Bob Example <bob@example.com>");
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue(project);
  state = "started";
  labels = { codaloudApp: "codaloud", codaloudProjectId: projectId };
  network.mockReset().mockImplementation(async (input, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    const url = new URL(String(input));
    if (url.pathname === "/api/sandbox/sandbox") return Response.json({ id: "sandbox", state, labels, toolboxProxyUrl: "https://toolbox.test" });
    if (url.pathname.endsWith("/start")) return Response.json({});
    if (url.pathname.endsWith("/user-home-dir")) return Response.json({ dir: home });
    if (url.pathname.endsWith("/process/execute")) {
      const body = JSON.parse(String(init?.body));
      try {
        const result = await execute("/bin/sh", ["-c", body.command], { env: { ...process.env, ...body.envs }, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
        return Response.json({ exitCode: 0, result: result.stdout });
      } catch (error) {
        return Response.json({ exitCode: 1, result: (error as { stdout: string }).stdout });
      }
    }
    throw new Error("Unexpected sandbox request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); vi.unstubAllGlobals(); });

it("reads structured history without changing HEAD, dirty files, or index", async () => {
  await git("checkout", "-b", "other");
  await writeFile(join(workspace, "dirty.txt"), "keep me");
  await git("add", "dirty.txt");
  const index = await readFile(join(workspace, ".git/index"));
  const result = await read();
  expect(result.commits.map((item) => item.message.split("\n")[0])).toEqual(["Latest change", "Login validation", "Initial commit"]);
  expect(result.commits[1].message).toContain('"quotes", commas, | and $(touch injected)');
  expect(result.commits[0]).toMatchObject({ author: "Bob Example", authorEmail: "bob@example.com", isMerge: false });
  expect(result.nextCursor).toBeNull();
  expect(await git("branch", "--show-current")).toBe("other");
  expect(await readFile(join(workspace, "dirty.txt"), "utf8")).toBe("keep me");
  expect(await readFile(join(workspace, ".git/index"))).toEqual(index);
  await expect(readFile(join(workspace, "injected"))).rejects.toThrow();
  expect(mocks.user).toHaveBeenCalledWith(headers);
  expect(mocks.project).toHaveBeenCalledWith("owner", projectId);
});

it("pins pagination while the branch advances and includes every merge parent", async () => {
  await git("checkout", "-b", "feature", "HEAD~1");
  const side = await commit("Side commit");
  await git("checkout", "main");
  await git("-c", "user.name=Committer", "-c", "user.email=committer@example.com", "merge", "--no-ff", "feature", "-m", "Merge feature");
  const expected = (await git("rev-list", "--topo-order", "main")).split("\n");
  const first = await read({ pageSize: 2 });
  expect(first.commits[0]).toMatchObject({ isMerge: true, parentHashes: expect.arrayContaining([side]) });
  await commit("Arrived after first page");
  const hashes = first.commits.map((item) => item.hash);
  let cursor = first.nextCursor;
  while (cursor) {
    const next = await read({ pageSize: 2, cursor });
    expect(next.snapshotSha).toBe(first.snapshotSha);
    hashes.push(...next.commits.map((item) => item.hash));
    cursor = next.nextCursor;
  }
  expect(hashes).toEqual(expected);
});

it("searches full messages, author names, emails and hashes with an optional author filter", async () => {
  expect((await read({ search: "  MULTILINE  " })).commits).toHaveLength(1);
  expect((await read({ search: "BOB" })).commits).toHaveLength(1);
  expect((await read({ search: "ADA@EXAMPLE.COM" })).commits).toHaveLength(2);
  const hash = await git("rev-parse", "HEAD");
  expect((await read({ search: hash.slice(0, 12) })).commits[0].hash).toBe(hash);
  expect((await read({ search: "login", author: "bob" })).commits).toEqual([]);
  expect((await read({ author: "ADA", pageSize: 1 })).nextCursor).not.toBeNull();
});

it("rejects invalid, tampered, cross-branch and changed-filter cursors", async () => {
  const first = await read({ pageSize: 1 });
  await git("branch", "other");
  for (const params of [
    { cursor: "invalid" }, { cursor: first.nextCursor + "x" },
    { cursor: first.nextCursor, branch: "other" }, { cursor: first.nextCursor, search: "other" },
    { cursor: first.nextCursor, author: "bob" }, { cursor: first.nextCursor, pageSize: 2 },
  ]) await expect(read({ pageSize: 1, ...params })).rejects.toMatchObject({ status: 400 });
});

it("blocks unauthenticated and unowned projects before contacting Daytona", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  await expect(read()).rejects.toMatchObject({ status: 401 });
  mocks.user.mockResolvedValue({ userId: "other" });
  mocks.project.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ status: 404 });
  expect(network).not.toHaveBeenCalled();
});

it.each(["stopped", "archived", "starting"])("restores or waits for a %s sandbox before Git reads", async (sandboxState) => {
  state = sandboxState;
  await expect(read()).rejects.toMatchObject({ status: 503, code: "WORKSPACE_RESTORING" });
  expect(network.mock.calls.some(([url]) => String(url).includes("/process/execute"))).toBe(false);
  expect(network.mock.calls.some(([url]) => String(url).endsWith("/start"))).toBe(sandboxState !== "starting");
});

it("rejects mismatched sandboxes, unavailable branches and invalid input", async () => {
  labels.codaloudProjectId = "another-project";
  await expect(read()).rejects.toMatchObject({ code: "SANDBOX_MISMATCH" });
  labels.codaloudProjectId = projectId;
  await expect(read({ branch: "missing" })).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND" });
  for (const branch of ["--all", "main~1", "refs/heads/main", "main\nother"]) {
    await expect(read({ branch })).rejects.toMatchObject({ status: 400 });
  }
  await expect(read({ pageSize: 101 })).rejects.toMatchObject({ status: 400 });
});

it("returns an empty history for an unborn branch and never falls back for a missing branch", async () => {
  await rm(join(workspace, ".git"), { recursive: true });
  await git("init", "-b", "main");
  expect(await read()).toMatchObject({ commits: [], snapshotSha: null, nextCursor: null });
  await expect(read({ branch: "missing" })).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND" });
});

it("rejects malformed process output without leaking upstream details", async () => {
  const original = network.getMockImplementation()!;
  network.mockImplementation(async (url, init) => String(url).includes("/process/execute")
    ? Response.json({ exitCode: 1, result: "test-key private output" }) : original(url, init));
  await expect(read()).rejects.toMatchObject({ code: "COMMITS_UNAVAILABLE" });
  await expect(read()).rejects.not.toThrow(/test-key|private output/);
});

it("reports shallow history and handles a new workspace without initializing Git", async () => {
  const tip = await git("rev-parse", "HEAD");
  await writeFile(join(workspace, ".git/shallow"), tip + "\n");
  const shallow = await read();
  expect(shallow.isShallow).toBe(true);
  expect(shallow.commits.map((item) => item.hash)).toEqual([tip]);
  await rm(join(workspace, ".git"), { recursive: true });
  mocks.project.mockResolvedValue({ ...project, githubRepositoryId: null });
  expect(await read()).toMatchObject({ commits: [], snapshotSha: null, nextCursor: null, isShallow: false });
  await expect(readFile(join(workspace, ".git/HEAD"))).rejects.toThrow();
});

it("continues author-filtered results and rejects cursors after the sandbox is replaced", async () => {
  const first = await read({ author: "Ada", pageSize: 1 });
  const second = await read({ author: "ada", pageSize: 1, cursor: first.nextCursor });
  expect(second.commits[0].message.trim()).toBe("Initial commit");
  expect(second.nextCursor).toBeNull();
  mocks.project.mockResolvedValue({ ...project, sandboxId: "replacement" });
  await expect(read({ author: "ada", pageSize: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: "INVALID_COMMIT_CURSOR" });
});

it("reads an untouched new project and an orphan branch as empty histories", async () => {
  await git("checkout", "--orphan", "fresh");
  expect(await read({ branch: "fresh" })).toMatchObject({ commits: [], snapshotSha: null });
  await rm(join(home, ".codaloud"), { recursive: true });
  mocks.project.mockResolvedValue({ ...project, githubRepositoryId: null });
  expect(await read()).toMatchObject({ commits: [], snapshotSha: null });
  await expect(readFile(join(home, ".codaloud/workspace/.git/HEAD"))).rejects.toThrow();
});

it("preserves Unicode regardless of the repository's log output encoding", async () => {
  await commit("Café résumé", "José <jose@example.com>");
  await git("config", "i18n.logOutputEncoding", "ISO-8859-1");
  expect((await read()).commits[0]).toMatchObject({ message: "Café résumé\n", author: "José" });
});
