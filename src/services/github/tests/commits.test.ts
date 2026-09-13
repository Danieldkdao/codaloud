import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readGitHubCommits } from "@/services/github/server/commits";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), accounts: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { listUserAccounts: mocks.accounts, getAccessToken: mocks.token } } }));
vi.mock("@/data/env/server", () => ({ serverEnv: { COMMIT_CURSOR_SIGNING_SECRET: "test-secret-for-commit-cursors-123456" } }));

const headers = new Headers({ cookie: "session=test" });
const projectId = "11111111-1111-4111-8111-111111111111";
const snapshotSha = "a".repeat(40);
const network = vi.fn<typeof fetch>();
const repository = { id: 123, name: "repo", full_name: "owner/repo", description: null, private: true, archived: false,
  default_branch: "main", clone_url: "https://github.com/owner/repo.git", html_url: "https://github.com/owner/repo", permissions: { pull: true } };
const commit = (number: number, message: string, author = "Ada") => ({
  sha: number.toString(16).padStart(40, "0"),
  commit: { message, author: { name: author, email: `${author}@example.com`, date: "2026-09-12T12:00:00Z" }, committer: { name: "Bot", email: "bot@example.com", date: "2026-09-12T13:00:00Z" } },
  author: null, parents: [{ sha: "b".repeat(40) }],
});
let pages: ReturnType<typeof commit>[][];
let branchName: string;
let branchTip: string;
let repoStatus: number;
let commitsStatus: number;
const read = (params: Record<string, unknown> = {}) => readGitHubCommits(headers, projectId, { branch: "main", ...params });

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue({ id: projectId, githubRepositoryId: "123", deletionRequested: false, setupStatus: "failed", sandboxId: null });
  mocks.accounts.mockReset().mockResolvedValue([{ id: "account", providerId: "github", scopes: ["repo"] }]);
  mocks.token.mockReset().mockResolvedValue({ accessToken: "private-token" });
  branchName = "main"; branchTip = snapshotSha; repoStatus = 200; commitsStatus = 200;
  pages = [[commit(1, "Login\n\nBody with commas, quotes and unicode 👋"), commit(2, "Cleanup", "Bob")]];
  network.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.github.com");
    expect(new Headers(init?.headers).get("authorization")).toBe("token private-token");
    if (url.pathname === "/repositories/123") return Response.json(repository, { status: repoStatus });
    if (url.pathname.startsWith("/repos/owner/repo/branches/")) return Response.json({ name: branchName, commit: { sha: branchTip } });
    if (url.pathname === "/repos/owner/repo/commits") {
      if (commitsStatus !== 200) return Response.json({ message: "private-token upstream details" }, { status: commitsStatus, headers: { "retry-after": "1" } });
      const page = Number(url.searchParams.get("page"));
      return Response.json(pages[page - 1] ?? [], { headers: page < pages.length ? { link: '<https://api.github.com/unused>; rel="next"' } : {} });
    }
    throw new Error("Unexpected GitHub request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("authenticates, verifies repository access and returns normalized commits without a running sandbox", async () => {
  pages[0][0].parents.push({ sha: "c".repeat(40) });
  const result = await read();
  expect(result).toMatchObject({ snapshotSha, isShallow: false, nextCursor: null });
  expect(result.commits[0]).toMatchObject({ message: pages[0][0].commit.message, author: "Ada", authorEmail: "Ada@example.com", committedAt: "2026-09-12T13:00:00Z", isMerge: true });
  expect(mocks.user).toHaveBeenCalledWith(headers);
  expect(mocks.project).toHaveBeenCalledWith("owner", projectId);
  expect(mocks.token).toHaveBeenCalledWith({ body: { accountId: "account" }, headers });
  expect(network.mock.calls.every(([url]) => String(url).startsWith("https://api.github.com/"))).toBe(true);
});

it("pins the remote tip and resumes within a searched page without duplicates", async () => {
  pages = [[commit(1, "LOGIN one"), commit(2, "Other"), commit(3, "login two"), commit(4, "Login three")], [commit(5, "login four")]];
  const first = await read({ search: " LOGIN ", author: "ada", pageSize: 2 });
  branchTip = "d".repeat(40);
  const second = await read({ search: "login", author: "ADA", pageSize: 2, cursor: first.nextCursor });
  expect([...first.commits, ...second.commits].map((item) => item.hash)).toEqual([1, 3, 4, 5].map((n) => n.toString(16).padStart(40, "0")));
  expect(second.nextCursor).toBeNull();
  expect(second.snapshotSha).toBe(snapshotSha);
  const requests = network.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname.endsWith("/commits"));
  expect(requests.map((url) => url.searchParams.get("page"))).toEqual(["1", "1", "2"]);
  expect(requests.every((url) => url.searchParams.get("sha") === snapshotSha)).toBe(true);
});

it("supports author, email, body and hash searches and intersects a separate author filter", async () => {
  for (const search of ["unicode", "ada", "ada@example.com", "0000000000000000000000000000000000000001"]) {
    expect((await read({ search })).commits.map((item) => item.hash)).toEqual([commit(1, "").sha]);
  }
  expect((await read({ search: "login", author: "bob" })).commits).toEqual([]);
  expect((await read({ author: "BOB" })).commits[0].author).toBe("Bob");
});

it("bounds sparse searches and returns continuation even when no matches were found yet", async () => {
  pages = [...Array.from({ length: 5 }, (_, i) => [commit(i + 1, "irrelevant")]), [commit(6, "needle")]];
  const first = await read({ search: "needle" });
  expect(first).toMatchObject({ commits: [], nextCursor: expect.any(String) });
  expect(network).toHaveBeenCalledTimes(7);
  const second = await read({ search: "needle", cursor: first.nextCursor });
  expect(second.commits).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
});

it("rejects cursor reuse across users, branches, filters, page sizes and expired sessions", async () => {
  pages.push([commit(3, "more")]);
  const first = await read();
  for (const params of [{ branch: "other" }, { author: "ada" }, { search: "login" }, { pageSize: 1 }, { cursor: first.nextCursor + "x" }]) {
    await expect(read({ cursor: first.nextCursor, ...params })).rejects.toMatchObject({ status: 400 });
  }
  mocks.user.mockResolvedValue({ userId: "different-owner" });
  await expect(read({ cursor: first.nextCursor })).rejects.toMatchObject({ status: 400 });
  mocks.user.mockResolvedValue({ userId: "owner" });
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 61 * 60 * 1000);
  await expect(read({ cursor: first.nextCursor })).rejects.toMatchObject({ status: 400 });
});

it("checks ownership and current credentials on every page", async () => {
  pages.push([commit(3, "more")]);
  const first = await read();
  network.mockClear();
  mocks.accounts.mockResolvedValue([]);
  await expect(read({ cursor: first.nextCursor })).rejects.toMatchObject({ status: 403, code: "GITHUB_RECONNECT_REQUIRED" });
  expect(network).not.toHaveBeenCalled();
  mocks.project.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ status: 404 });
  mocks.user.mockResolvedValue({ userId: null });
  await expect(read()).rejects.toMatchObject({ status: 401 });
});

it("rejects access denial and renamed branches without returning another history", async () => {
  repoStatus = 404;
  await expect(read()).rejects.toMatchObject({ status: 403 });
  repoStatus = 200; branchName = "renamed";
  await expect(read()).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND" });
});

it.each([429, 500])("sanitizes a GitHub %s error and does not retry in the reader", async (status) => {
  commitsStatus = status;
  await expect(read()).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
  expect(network).toHaveBeenCalledTimes(3);
  await expect(read()).rejects.not.toThrow(/private-token|upstream details/);
});

it("rejects malformed commit metadata and already-cancelled requests", async () => {
  pages[0][0].sha = "invalid";
  await expect(read()).rejects.toMatchObject({ status: 502 });
  network.mockClear();
  const controller = new AbortController(); controller.abort();
  await expect(readGitHubCommits(headers, projectId, { branch: "main" }, controller.signal)).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});

it("does not return a partial search page if a later GitHub batch fails", async () => {
  pages = [[commit(1, "match one")], [commit(2, "match two")]];
  const original = network.getMockImplementation()!;
  network.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/commits") && url.searchParams.get("page") === "2") {
      return Response.json({ message: "private-token" }, { status: 500 });
    }
    return original(input, init);
  });
  await expect(read({ search: "match" })).rejects.toMatchObject({ status: 502 });
});

it("rejects projects without a repository or pending deletion before looking up credentials", async () => {
  mocks.project.mockResolvedValue({ id: projectId, githubRepositoryId: null });
  await expect(read()).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_REQUIRED" });
  mocks.project.mockResolvedValue({ id: projectId, githubRepositoryId: "123", deletionRequested: true });
  await expect(read()).rejects.toMatchObject({ code: "PROJECT_DELETING" });
  expect(mocks.accounts).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("asks for a history refresh when a pinned remote snapshot is no longer available", async () => {
  pages.push([commit(3, "more")]);
  const first = await read();
  commitsStatus = 404;
  await expect(read({ cursor: first.nextCursor })).rejects.toMatchObject({ status: 409, code: "HISTORY_SNAPSHOT_UNAVAILABLE" });
});
