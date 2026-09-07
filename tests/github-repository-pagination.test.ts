import { describe, expect, it, vi } from "vitest";
import { paginateGitHubRepositories } from "@/services/github/server/repository-pagination";
import type { GitHubRepository, GitHubRepositoryBatch } from "@/services/github/types";

const repository = (id: number, name = "match"): GitHubRepository => ({
  id, name, fullName: `owner/${name}`, description: null,
  private: false, archived: false, defaultBranch: "main",
  cloneUrl: `https://github.com/owner/${name}.git`, htmlUrl: `https://github.com/owner/${name}`,
  permissions: { pull: true, push: false, admin: false },
});
const loader = (pages: GitHubRepository[][]) => vi.fn(async (page: number): Promise<GitHubRepositoryBatch> => ({
  repositories: pages[page - 1] ?? [], hasNextPage: page < pages.length,
}));

describe("resumable repository search", () => {
  it("scans 12 completed GitHub pages once instead of making 78 upstream calls", async () => {
    const load = loader(Array.from({ length: 12 }, (_, page) =>
      Array.from({ length: 100 }, (_, index) =>
        repository(page * 100 + index + 1, index === 99 ? "match" : "other"),
      ),
    ));
    let cursor: string | null = null;
    const ids: number[] = [];
    do {
      const result = await paginateGitHubRepositories(load, { search: "match", pageSize: 1, cursor });
      ids.push(...result.repositories.map(({ id }) => id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, index) => (index + 1) * 100));
    expect(load.mock.calls.map(([page]) => page)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  it("resumes within a GitHub page without dropping or duplicating remaining matches", async () => {
    const load = loader([[repository(1), repository(2, "other"), repository(3), repository(4)], [repository(5)]]);
    const first = await paginateGitHubRepositories(load, { search: "match", pageSize: 2 });
    const second = await paginateGitHubRepositories(load, { search: "match", pageSize: 2, cursor: first.nextCursor });
    expect(first.repositories.map(({ id }) => id)).toEqual([1, 3]);
    expect(second.repositories.map(({ id }) => id)).toEqual([4, 5]);
    expect(second.nextCursor).toBeNull();
    expect(load.mock.calls.map(([page]) => page)).toEqual([1, 1, 2]);
  });

  it("returns a continuation after five sparse pages and can find a later match", async () => {
    const load = loader([...Array.from({ length: 5 }, (_, index) => [repository(index, "other")]), [repository(99)]]);
    const first = await paginateGitHubRepositories(load, { search: "match" });
    expect(first.repositories).toEqual([]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(load).toHaveBeenCalledTimes(5);
    const second = await paginateGitHubRepositories(load, { search: "match", cursor: first.nextCursor });
    expect(second.repositories.map(({ id }) => id)).toEqual([99]);
    expect(second.nextCursor).toBeNull();
    expect(load.mock.calls.at(-1)?.[0]).toBe(6);
  });

  it("keeps partial results when the scan budget is reached", async () => {
    const load = loader([[repository(1)], ...Array.from({ length: 5 }, () => [repository(2, "other")])]);
    const result = await paginateGitHubRepositories(load, { search: "match", pageSize: 20 });
    expect(result.repositories.map(({ id }) => id)).toEqual([1]);
    expect(result.nextCursor).not.toBeNull();
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("does not infer completion from the number of matches", async () => {
    const load = loader([[repository(1), repository(2)]]);
    const result = await paginateGitHubRepositories(load, { search: "match", pageSize: 2 });
    expect(result.repositories).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });

  it("preserves trimmed case-insensitive name and description matching", async () => {
    const load = loader([[repository(1, "Match"), { ...repository(2, "other"), description: "A MATCH" }, repository(3, "other")]]);
    const result = await paginateGitHubRepositories(load, { search: " MATCH " });
    expect(result.repositories.map(({ id }) => id)).toEqual([1, 2]);
  });

  it.each(["acme", "acme/weather", "me/wea", "  ACME/WEATHER  "])(
    "matches the displayed owner and repository name for %j",
    async (search) => {
      const load = loader([[
        { ...repository(1, "weather"), fullName: "Acme/weather" },
        { ...repository(2, "weather"), fullName: "AnotherOrg/weather" },
      ]]);
      const result = await paginateGitHubRepositories(load, { search });
      expect(result.repositories.map(({ id }) => id)).toEqual([1]);
      expect(result.nextCursor).toBeNull();
    },
  );

  it("uses one upstream page and its has-next flag for unfiltered browsing", async () => {
    const load = loader([[repository(1)], [repository(2)]]);
    const first = await paginateGitHubRepositories(load, { pageSize: 2 });
    expect(first.repositories).toHaveLength(1);
    expect(load).toHaveBeenCalledExactlyOnceWith(1, 2);
    const second = await paginateGitHubRepositories(load, { pageSize: 2, cursor: first.nextCursor });
    expect(second.repositories.map(({ id }) => id)).toEqual([2]);
    expect(second.nextCursor).toBeNull();
  });

  it("retries the same continuation after an upstream error", async () => {
    const load = loader([[repository(1)], [repository(2)]]);
    const first = await paginateGitHubRepositories(load, { search: "match", pageSize: 1 });
    load.mockRejectedValueOnce(new Error("Network failed"));
    await expect(paginateGitHubRepositories(load, { search: "match", pageSize: 1, cursor: first.nextCursor })).rejects.toThrow("Network failed");
    const retry = await paginateGitHubRepositories(load, { search: "match", pageSize: 1, cursor: first.nextCursor });
    expect(retry.repositories.map(({ id }) => id)).toEqual([2]);
    expect(load.mock.calls.map(([page]) => page)).toEqual([1, 2, 2]);
  });

  it("stops scanning when cancelled, including before the first request", async () => {
    const controller = new AbortController();
    const load = loader([[repository(1, "other")], [repository(2)]]);
    load.mockImplementationOnce(async () => {
      controller.abort();
      return { repositories: [repository(1, "other")], hasNextPage: true };
    });
    await expect(paginateGitHubRepositories(load, { search: "match" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(load).toHaveBeenCalledOnce();
    load.mockClear();
    await expect(paginateGitHubRepositories(load, {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps a continuation usable across stateless requests", async () => {
    const first = await paginateGitHubRepositories(loader([[repository(1)], [repository(2)]]), { search: "match", pageSize: 1 });
    const freshLoad = loader([[repository(1)], [repository(2)]]);
    const next = await paginateGitHubRepositories(freshLoad, { search: " MATCH ", pageSize: 1, cursor: first.nextCursor });
    expect(next.repositories.map(({ id }) => id)).toEqual([2]);
    expect(freshLoad).toHaveBeenCalledExactlyOnceWith(2, 100);
  });
});

describe("cursor validation", () => {
  it.each(["", "not-a-cursor", "e30", "a".repeat(2049)])("rejects malformed cursors before loading: %s", async (cursor) => {
    const load = loader([]);
    await expect(paginateGitHubRepositories(load, { cursor })).rejects.toMatchObject({ status: 400 });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    { version: 2 }, { page: 0 }, { page: 1.5 }, { offset: -1 }, { offset: 100 },
    { page: Number.MAX_SAFE_INTEGER + 1 }, { url: "https://other.test" },
  ])("rejects invalid cursor positions or fields: %j", async (fields) => {
    const cursor = Buffer.from(JSON.stringify({ version: 1, page: 1, offset: 0, search: "match", pageSize: 20, ...fields })).toString("base64url");
    const load = loader([]);
    await expect(paginateGitHubRepositories(load, { search: "match", cursor })).rejects.toMatchObject({ status: 400 });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects a continuation reused for a different search or page size", async () => {
    const load = loader([[repository(1)], [repository(2)]]);
    const first = await paginateGitHubRepositories(load, { search: "match", pageSize: 1 });
    load.mockClear();
    await expect(paginateGitHubRepositories(load, { search: "other", pageSize: 1, cursor: first.nextCursor })).rejects.toMatchObject({ status: 400 });
    await expect(paginateGitHubRepositories(load, { search: "match", pageSize: 2, cursor: first.nextCursor })).rejects.toMatchObject({ status: 400 });
    expect(load).not.toHaveBeenCalled();
  });
});


it.each([7, 20, 100])("delivers every match across full upstream pages with result size %s", async (pageSize) => {
  const upstream = Array.from({ length: 320 }, (_, index) => repository(index + 1, index % 3 === 0 ? "other" : "match"));
  const load = loader(Array.from({ length: 4 }, (_, index) => upstream.slice(index * 100, (index + 1) * 100)));
  const received: number[] = [];
  let cursor: string | null = null;
  for (let request = 0; request < 100; request++) {
    const result = await paginateGitHubRepositories(load, { search: "match", pageSize, cursor });
    received.push(...result.repositories.map(({ id }) => id));
    cursor = result.nextCursor;
    if (cursor === null) break;
  }
  expect(cursor).toBeNull();
  expect(received).toEqual(upstream.filter(({ name }) => name === "match").map(({ id }) => id));
  const requestedPages = load.mock.calls.map(([page]) => page);
  expect(requestedPages).toEqual([...requestedPages].sort((a, b) => a - b));
});
