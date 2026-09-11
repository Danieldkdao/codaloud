import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import { getGitHubImportSource } from "@/services/github/server/import-source";
import { getGitHubErrorResponse } from "@/services/github/server/access";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  pg: undefined as unknown as PGlite,
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getAccessToken: mocks.getAccessToken } },
}));
vi.mock("@/db/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mocks.pg = await PGlite.create();
  return { db: drizzle(mocks.pg) };
});

const userId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const otherUserId = "00000000-0000-4000-8000-000000000003";
const network = vi.fn<typeof fetch>();
const repository = {
  id: 123,
  name: "renamed-repository",
  full_name: "new-owner/renamed-repository",
  description: null,
  private: true,
  archived: false,
  default_branch: "development",
  clone_url: "https://github.com/new-owner/renamed-repository.git",
  html_url: "https://github.com/new-owner/renamed-repository",
  permissions: { pull: true, push: false, admin: false },
  temp_clone_token: "upstream-secret",
};

beforeAll(async () => {
  await import("@/db/db");
  await mocks.pg.exec(`create table account (
    id uuid primary key, user_id uuid not null, provider_id text not null, scope text
  )`);
});
afterAll(async () => { await mocks.pg?.close(); });
beforeEach(async () => {
  await mocks.pg.exec("truncate account");
  await mocks.pg.query("insert into account values ($1, $2, 'github', 'read:user, repo')", [accountId, userId]);
  mocks.getAccessToken.mockReset().mockResolvedValue({ accessToken: "fresh-token" });
  network.mockReset().mockImplementation(async (url) => Response.json(
    String(url).includes("/branches/") ? { name: "feature/import", commit: { sha: "abc123" } } : repository,
  ));
  vi.stubGlobal("fetch", network);
});

describe("GitHub import source for background work", () => {
  it("resolves the saved account without a phone session and rechecks the repository by ID", async () => {
    const source = await getGitHubImportSource(userId, accountId, "123", "feature/import");

    expect(mocks.getAccessToken).toHaveBeenCalledExactlyOnceWith({ body: { userId, accountId } });
    expect(network).toHaveBeenCalledTimes(2);
    expect(String(network.mock.calls[1][0])).toBe("https://api.github.com/repos/new-owner/renamed-repository/branches/feature%2Fimport");
    const [url, options] = network.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repositories/123");
    expect(new Headers(options?.headers).get("authorization")).toBe("token fresh-token");
    expect(source).toEqual({
      accessToken: "fresh-token",
      branchName: "feature/import",
      repository: {
        id: 123,
        name: "renamed-repository",
        fullName: "new-owner/renamed-repository",
        description: null,
        private: true,
        archived: false,
        defaultBranch: "development",
        cloneUrl: repository.clone_url,
        htmlUrl: repository.html_url,
        permissions: repository.permissions,
      },
    });
    expect(JSON.stringify(source.repository)).not.toMatch(/token|secret/);
  });

  it.each(["another-user", "unlinked", "wrong-provider", "missing-grant", "similar-grant", "null-grant"])(
    "rejects a saved account with %s before retrieving a token",
    async (scenario) => {
      if (scenario === "another-user") await mocks.pg.query("update account set user_id = $1", [otherUserId]);
      if (scenario === "unlinked") await mocks.pg.exec("delete from account");
      if (scenario === "wrong-provider") await mocks.pg.exec("update account set provider_id = 'google'");
      if (scenario === "missing-grant") await mocks.pg.exec("update account set scope = 'public_repo'");
      if (scenario === "similar-grant") await mocks.pg.exec("update account set scope = 'repo:status'");
      if (scenario === "null-grant") await mocks.pg.exec("update account set scope = null");

      await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toMatchObject({ code: "GITHUB_RECONNECT_REQUIRED" });
      expect(mocks.getAccessToken).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it("does not substitute another linked account when the saved account is missing", async () => {
    await expect(getGitHubImportSource(userId, null, "123", "feature/import")).rejects.toMatchObject({ code: "GITHUB_RECONNECT_REQUIRED" });
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects an empty token before contacting GitHub", async () => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: "" });
    await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toMatchObject({ code: "GITHUB_RECONNECT_REQUIRED" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { ...repository, permissions: { pull: false } },
    { ...repository, id: 456 },
  ])("rejects access removed since selection or an incorrect repository", async (response) => {
    network.mockImplementation(async () => Response.json(response));
    await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toThrow(/access to import/);
  });

  it("rejects incomplete clone metadata", async () => {
    network.mockImplementation(async () => Response.json({ id: 123, permissions: { pull: true } }));
    await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toThrow();
  });

  it.each([401, 404, 429, 500])("preserves GitHub %s for safe error handling and retry decisions", async (status) => {
    network.mockImplementation(async () => Response.json({ message: "upstream-secret" }, { status }));
    const error = await getGitHubImportSource(userId, accountId, "123", "feature/import").catch((error: unknown) => error);
    expect(error).toMatchObject({ status });
    expect(JSON.stringify(getGitHubErrorResponse(error))).not.toMatch(/fresh-token|upstream-secret/);
    expect(network).toHaveBeenCalledOnce();
  });
});

it("rejects an operation whose branch was never saved", async () => {
  await expect(getGitHubImportSource(userId, accountId, "123", null)).rejects.toThrow(/branch/i);
  expect(network).not.toHaveBeenCalled();
});

it.each([404, 401, 429])("rejects branch validation failure %s", async (status) => {
  network.mockImplementation(async (url) => String(url).includes("/branches/")
    ? Response.json({ message: "private details" }, { status }) : Response.json(repository));
  await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toMatchObject({ status });
});

it("rejects a branch renamed since selection", async () => {
  network.mockImplementation(async (url) => Response.json(String(url).includes("/branches/")
    ? { name: "renamed", commit: { sha: "abc123" } } : repository));
  await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toThrow(/branch/i);
});

it.each(["https://example.com/repo.git", "https://token@github.com/new-owner/renamed-repository.git"])
("rejects unsafe clone URLs before passing credentials to Daytona", async (cloneUrl) => {
  network.mockImplementation(async () => Response.json({ ...repository, clone_url: cloneUrl }));
  await expect(getGitHubImportSource(userId, accountId, "123", "feature/import")).rejects.toThrow(/clone/i);
});
