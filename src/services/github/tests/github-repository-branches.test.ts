import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_SIZE } from "@/lib/constants";
import { listGitHubRepositoryBranches, listGitHubRepositoryPage } from "@/services/github/server/repositories";

vi.mock("@/lib/auth/auth", () => ({ auth: { api: {} } }));

const network = vi.fn<typeof fetch>();
const repository = {
  id: 123,
  name: "renamed-repository",
  full_name: "new-owner/renamed-repository",
  description: null,
  private: true,
  archived: false,
  default_branch: "main",
  clone_url: "https://github.com/new-owner/renamed-repository.git",
  html_url: "https://github.com/new-owner/renamed-repository",
  permissions: { pull: true, push: false, admin: false },
};
const branch = (name: string, protectedBranch = false) => ({
  name,
  commit: { sha: "a".repeat(40), url: "https://api.github.com/unused" },
  protected: protectedBranch,
  protection_url: "https://api.github.com/unused-protection",
});
const branchesUrl = "https://api.github.com/repos/new-owner/renamed-repository/branches";

const mockBranchPages = (pages: ReturnType<typeof branch>[][]) => {
  network.mockReset().mockImplementation(async (url) => {
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname.startsWith("/repositories/")) {
      return Response.json({ ...repository, id: Number(requestUrl.pathname.split("/").at(-1)) });
    }
    const page = Number(requestUrl.searchParams.get("page"));
    return Response.json(pages[page - 1] ?? [], {
      headers: page < pages.length ? { link: `<${branchesUrl}?page=${page + 1}>; rel="next"` } : {},
    });
  });
};

beforeEach(() => {
  network.mockReset().mockResolvedValueOnce(Response.json(repository));
  vi.stubGlobal("fetch", network);
});

describe("branch search and cursor pagination", () => {
  it("matches only branch names, case-insensitively, and resumes inside a page", async () => {
    mockBranchPages([
      [branch("Feature/ONE", true), { ...branch("main"), protection_url: "https://api.github.com/feature/protection" }, branch("feature/two"), branch("FEATURE/three")],
      [branch("feature/four")],
    ]);
    const first = await listGitHubRepositoryBranches("token", "123", undefined, { search: "  FEATURE/  ", pageSize: 2 });
    expect(first.branches.map(({ name }) => name)).toEqual(["Feature/ONE", "feature/two"]);
    const second = await listGitHubRepositoryBranches("token", "123", undefined, {
      search: "feature/", pageSize: 2, cursor: first.nextCursor,
    });
    expect(second.branches.map(({ name }) => name)).toEqual(["FEATURE/three", "feature/four"]);
    expect(second.nextCursor).toBeNull();
    const branchRequests = network.mock.calls.map(([url]) => new URL(String(url)))
      .filter(({ pathname }) => pathname.endsWith("/branches"));
    expect(branchRequests.map(({ searchParams }) => searchParams.get("page"))).toEqual(["1", "1", "2"]);
    expect(branchRequests.every(({ searchParams }) => searchParams.get("per_page") === "100")).toBe(true);
  });

  it("continues after five empty search batches without rescanning completed pages", async () => {
    mockBranchPages([...Array.from({ length: 5 }, () => [branch("main")]), [branch("feature/later")]]);
    const first = await listGitHubRepositoryBranches("token", "123", undefined, { search: "feature" });
    expect(first).toEqual({ branches: [], nextCursor: expect.any(String) });
    expect(network).toHaveBeenCalledTimes(6);
    const second = await listGitHubRepositoryBranches("token", "123", undefined, { search: "feature", cursor: first.nextCursor });
    expect(second.branches.map(({ name }) => name)).toEqual(["feature/later"]);
    expect(second.nextCursor).toBeNull();
    expect(network).toHaveBeenCalledTimes(8);
    expect(new URL(String(network.mock.lastCall?.[0])).searchParams.get("page")).toBe("6");
  });

  it("treats whitespace search as ordinary single-page browsing", async () => {
    mockBranchPages([[branch("main")], [branch("develop")]]);
    const result = await listGitHubRepositoryBranches("token", "123", undefined, { search: "   ", pageSize: 7 });
    expect(result.branches.map(({ name }) => name)).toEqual(["main"]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(network).toHaveBeenCalledTimes(2);
    expect(new URL(String(network.mock.lastCall?.[0])).searchParams.get("per_page")).toBe("7");
  });

  it("returns null continuation when a search is exhausted without matches", async () => {
    mockBranchPages([[branch("main")], [branch("develop")]]);
    expect(await listGitHubRepositoryBranches("token", "123", undefined, { search: "missing" }))
      .toEqual({ branches: [], nextCursor: null });
  });

  it.each(["", "e30", "not-a-cursor", "a".repeat(2049)])("rejects malformed cursors: %s", async (cursor) => {
    await expect(listGitHubRepositoryBranches("token", "123", undefined, { cursor })).rejects.toThrow();
    expect(network.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith("/branches"))).toBe(false);
  });

  it.each([
    { search: "other", pageSize: 1, repositoryId: "123" },
    { search: "feature", pageSize: 2, repositoryId: "123" },
    { search: "feature", pageSize: 1, repositoryId: "456" },
  ])("rejects cursors reused with different search, size, or repository: %j", async ({ repositoryId, ...pagination }) => {
    mockBranchPages([[branch("feature/one"), branch("feature/two")]]);
    const first = await listGitHubRepositoryBranches("token", "123", undefined, { search: "feature", pageSize: 1 });
    network.mockClear();
    await expect(listGitHubRepositoryBranches("token", repositoryId, undefined, { ...pagination, cursor: first.nextCursor }))
      .rejects.toMatchObject({ status: 400 });
    expect(network.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith("/branches"))).toBe(false);
  });

  it("rejects a branch cursor passed to repository listing", async () => {
    mockBranchPages([[branch("feature/one"), branch("feature/two")]]);
    const first = await listGitHubRepositoryBranches("token", "123", undefined, { search: "feature", pageSize: 1 });
    network.mockClear();
    await expect(listGitHubRepositoryPage("token", undefined, { search: "feature", pageSize: 1, cursor: first.nextCursor }))
      .rejects.toMatchObject({ status: 400 });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([0, 101, 1.5, NaN])("rejects invalid page size %s before making requests", async (pageSize) => {
    await expect(listGitHubRepositoryBranches("token", "123", undefined, { pageSize })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects oversized search before making requests", async () => {
    await expect(listGitHubRepositoryBranches("token", "123", undefined, { search: "a".repeat(201) })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("listGitHubRepositoryBranches", () => {
  it("rechecks access by ID and returns one page at a time using the current repository name", async () => {
    const signal = new AbortController().signal;
    const firstPage = Array.from({ length: 100 }, (_, index) => branch(`branch-${index}`, index === 0));
    network
      .mockResolvedValueOnce(Response.json(firstPage, {
        headers: { link: `<${branchesUrl}?per_page=100&page=2>; rel="next"` },
      }))
      .mockResolvedValueOnce(Response.json(repository))
      .mockResolvedValueOnce(Response.json([branch("feature/import-branch")]));

    const first = await listGitHubRepositoryBranches("private-token", "123", signal, { pageSize: 100 });
    expect(first.branches).toHaveLength(100);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(network).toHaveBeenCalledTimes(2);
    const second = await listGitHubRepositoryBranches("private-token", "123", signal, {
      pageSize: 100, cursor: first.nextCursor,
    });
    expect(second.nextCursor).toBeNull();
    const branches = [...first.branches, ...second.branches];

    expect(branches).toHaveLength(101);
    expect(branches[0]).toEqual({ name: "branch-0", commitSha: "a".repeat(40), protected: true });
    expect(branches[100]).toEqual({ name: "feature/import-branch", commitSha: "a".repeat(40), protected: false });
    expect(network.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.github.com/repositories/123",
      `${branchesUrl}?page=1&per_page=100`,
      "https://api.github.com/repositories/123",
      `${branchesUrl}?page=2&per_page=100`,
    ]);
    for (const [, options] of network.mock.calls) {
      expect(new Headers(options?.headers).get("authorization")).toBe("token private-token");
      expect(options?.signal).toBe(signal);
    }
  });

  it("returns an empty collection when the repository has no branches", async () => {
    network.mockResolvedValueOnce(Response.json([]));
    expect(await listGitHubRepositoryBranches("token", "123")).toEqual({ branches: [], nextCursor: null });
    expect(new URL(String(network.mock.lastCall?.[0])).searchParams.get("per_page")).toBe(String(PAGE_SIZE));
  });

  it.each([
    { ...repository, permissions: { pull: false } },
    { ...repository, permissions: undefined },
    { ...repository, id: 456 },
  ])("does not fetch branches when repository verification fails: %j", async (response) => {
    network.mockReset().mockResolvedValue(Response.json(response));
    await expect(listGitHubRepositoryBranches("token", "123")).rejects.toThrow(/access to import/);
    expect(network).toHaveBeenCalledOnce();
  });

  it("rechecks access on later calls after permission is revoked", async () => {
    network
      .mockResolvedValueOnce(Response.json([branch("main")], {
        headers: { link: `<${branchesUrl}?page=2>; rel="next"` },
      }))
      .mockResolvedValueOnce(Response.json({ ...repository, permissions: { pull: false } }));
    const first = await listGitHubRepositoryBranches("token", "123");
    await expect(listGitHubRepositoryBranches("token", "123", undefined, { cursor: first.nextCursor })).rejects.toThrow(/access to import/);
    expect(network).toHaveBeenCalledTimes(3);
    expect(String(network.mock.lastCall?.[0])).toBe("https://api.github.com/repositories/123");
  });

  it.each([401, 403, 404, 429, 500])("propagates verification failure %s before fetching branches", async (status) => {
    network.mockReset().mockResolvedValue(Response.json({ message: "GitHub failure" }, { status }));
    await expect(listGitHubRepositoryBranches("token", "123")).rejects.toMatchObject({ status });
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 404, 429, 500])("rejects partial results when a later branch page fails with %s", async (status) => {
    network
      .mockResolvedValueOnce(Response.json([branch("main")], {
        headers: { link: `<${branchesUrl}?per_page=100&page=2>; rel="next"` },
      }))
      .mockResolvedValueOnce(Response.json({ message: "GitHub failure" }, { status }));
    await expect(listGitHubRepositoryBranches("token", "123", undefined, { search: "main", pageSize: 2 })).rejects.toMatchObject({ status });
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("propagates cancellation while listing branches", async () => {
    const controller = new AbortController();
    network.mockImplementationOnce(async (_url, options) => {
      controller.abort();
      options?.signal?.throwIfAborted();
      return Response.json([]);
    });
    await expect(listGitHubRepositoryBranches("token", "123", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(network).toHaveBeenCalledTimes(2);
  });
});
