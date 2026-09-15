import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readGitHubCommitDetails } from "@/services/github/server/commit-details";
const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), accounts: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { listUserAccounts: mocks.accounts, getAccessToken: mocks.token } } }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
const headers = new Headers({ cookie: "session=test" });
const projectId = "11111111-1111-4111-8111-111111111111";
const sha = "a".repeat(40);
const parent = "b".repeat(40);
const project = { id: projectId, githubRepositoryId: "123", deletionRequested: false, setupStatus: "failed", sandboxId: null };
const repository = { id: 123, name: "repo", full_name: "owner/repo", description: null, private: true, archived: false,
  default_branch: "main", clone_url: "https://github.com/owner/repo.git", html_url: "https://github.com/owner/repo", permissions: { pull: true } };
const metadata = { sha, commit: { message: "Subject\n\nFull body", author: { name: "Ada", email: "ada@example.com", date: "2026-09-15T12:00:00Z" }, committer: { name: "Bot", email: "bot@example.com", date: "2026-09-15T13:00:00Z" } }, parents: [{ sha: parent }], stats: { additions: 1, deletions: 0, total: 1 } };
const file = (filename = "file.txt") => ({ filename, status: "added", additions: 1, deletions: 0, changes: 1, patch: "@@ -0,0 +1 @@\n+hello" });
const network = vi.fn<typeof fetch>();
let pages: Record<string, unknown>[];
let status: number;
let repositoryStatus: number;
const read = (hash = sha, signal?: AbortSignal) => readGitHubCommitDetails(headers, projectId, hash, signal);
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" }); mocks.project.mockReset().mockResolvedValue(project);
  mocks.accounts.mockReset().mockResolvedValue([{ id: "account", providerId: "github", scopes: ["repo"] }]);
  mocks.token.mockReset().mockResolvedValue({ accessToken: "private-token" });
  pages = [{ ...metadata, files: [file()] }]; status = 200; repositoryStatus = 200;
  network.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://api.github.com");
    expect(new Headers(init?.headers).get("authorization")).toBe("token private-token");
    if (url.pathname === "/repositories/123") return Response.json(repository, { status: repositoryStatus });
    if (url.pathname === `/repos/owner/repo/commits/${sha}`) {
      if (status !== 200) return Response.json({ message: "private-token upstream details" }, { status });
      const page = Number(url.searchParams.get("page"));
      return Response.json(pages[page - 1], { headers: page < pages.length ? { link: '<https://evil.test/token-leak>; rel="next"' } : {} });
    }
    throw new Error("Unexpected GitHub request");
  }); vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());
it("reads a verified GitHub commit without requiring a running workspace", async () => {
  expect(await read()).toMatchObject({ source: "remote", baseSha: parent, githubUrl: `https://github.com/owner/repo/commit/${sha}`,
    commit: { hash: sha, author: "Ada", authorEmail: "ada@example.com", committer: "Bot", message: "Subject\n\nFull body" },
    files: [{ path: "file.txt", beforeMode: null, afterMode: null, diff: { patch: "@@ -0,0 +1 @@\n+hello\n", additions: 1 } }], summary: { fileCount: 1, additions: 1, deletions: 0, unavailableCount: 0 } });
  expect(mocks.project).toHaveBeenCalledWith("owner", projectId);
});
it("follows file pagination by page number and checks every page against the requested SHA", async () => {
  pages = ["first.txt", "second.txt"].map(name => ({ ...metadata, files: [file(name)] }));
  expect((await read()).files.map(item => item.path)).toEqual(["first.txt", "second.txt"]);
  const urls = network.mock.calls.map(([url]) => new URL(String(url))).filter(url => url.pathname.includes("/commits/"));
  expect(urls.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
  pages[1] = { ...pages[1], sha: "c".repeat(40) };
  await expect(read()).rejects.toMatchObject({ status: 502 });
});
it("supports root, empty, and first-parent merge metadata", async () => {
  pages = [{ ...metadata, parents: [], files: [] }]; expect(await read()).toMatchObject({ baseSha: null, files: [], commit: { isMerge: false } });
  pages = [{ ...metadata, parents: [{ sha: parent }, { sha: "c".repeat(40) }], files: [] }];
  expect(await read()).toMatchObject({ baseSha: parent, commit: { isMerge: true } });
});
it("discloses missing and oversized patches without inventing line totals", async () => {
  pages = [{ ...metadata, files: [{ ...file("binary"), patch: undefined }, { ...file("large"), patch: "a".repeat(256 * 1024 + 1) }] }];
  const result = await read(); expect(result.files.map(item => item.diff.unavailableReason)).toEqual(["unsupported", "too-large"]);
  expect(result.summary).toEqual({ fileCount: 2, additions: 0, deletions: 0, unavailableCount: 2 });
});
it.each([
  [{ ...file(), patch: "@@ -0,0 +1,2 @@\n+incomplete" }],
  [{ ...file(), additions: 2 }],
  [file(), file()],
  [{ ...file(), filename: "../outside" }],
  [{ ...file(), status: "renamed" }],
].map(files => ({ files })))("rejects invalid, incomplete, or duplicate file data", async ({ files }) => {
  pages = [{ ...metadata, files }]; await expect(read()).rejects.toMatchObject({ status: 502 });
});
it("rejects changing metadata across pages", async () => {
  pages.push({ ...metadata, commit: { ...metadata.commit, message: "Different" }, files: [file("second")] });
  await expect(read()).rejects.toMatchObject({ status: 502 });
});
it("rejects the provider file ceiling instead of claiming the response is complete", async () => {
  pages = Array.from({ length: 30 }, (_, page) => ({ ...metadata, files: Array.from({ length: 100 }, (_, index) => file(`${page}-${index}`)) }));
  await expect(read()).rejects.toMatchObject({ status: 413, code: "COMMIT_DIFF_TOO_LARGE" });
});
it("checks authentication, ownership, and connection before provider access", async () => {
  mocks.user.mockResolvedValue({ userId: null }); await expect(read()).rejects.toMatchObject({ status: 401 });
  mocks.user.mockResolvedValue({ userId: "owner" }); mocks.project.mockResolvedValue(null); await expect(read()).rejects.toMatchObject({ status: 404 });
  mocks.project.mockResolvedValue({ ...project, githubRepositoryId: null }); await expect(read()).rejects.toMatchObject({ status: 409 });
  mocks.project.mockResolvedValue({ ...project, deletionRequested: true }); await expect(read()).rejects.toMatchObject({ status: 409 });
  expect(network).not.toHaveBeenCalled();
});
it.each(["HEAD", "abc123", "--help"])("rejects invalid SHA before provider access: %s", async hash => {
  await expect(read(hash)).rejects.toMatchObject({ status: 400 }); expect(network).not.toHaveBeenCalled();
});
it("rejects denied repository access before reading the commit", async () => {
  repositoryStatus = 404; await expect(read()).rejects.toMatchObject({ status: 403 }); expect(network).toHaveBeenCalledTimes(1);
});
it.each([[404, 404], [401, 403], [403, 403], [429, 429], [500, 502]])("maps provider status %s to safe status %s", async (upstream, expected) => {
  status = upstream;
  try { await read(); throw new Error("Expected rejection"); } catch (error) {
    expect(error).toMatchObject({ status: expected }); expect((error as Error).message).not.toContain("private-token");
  }
});
it("honors cancellation before making a provider request", async () => {
  await expect(read(sha, AbortSignal.abort())).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});
