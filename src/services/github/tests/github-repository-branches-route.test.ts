import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

import { GET } from "@/app/api/github/repository/[repositoryId]/branches+api";
import { PAGE_SIZE } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listUserAccounts: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { listUserAccounts: mocks.listUserAccounts, getAccessToken: mocks.getAccessToken } },
}));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

const network = vi.fn<typeof fetch>();
const repository = {
  id: 123,
  name: "renamed",
  full_name: "current-owner/renamed",
  description: null,
  private: true,
  archived: false,
  default_branch: "main",
  clone_url: "https://github.com/current-owner/renamed.git",
  html_url: "https://github.com/current-owner/renamed",
  permissions: { pull: true, push: false, admin: false },
};
const branch = (name: string) => ({
  name,
  commit: { sha: "a".repeat(40), url: "private-upstream-url" },
  protected: false,
});
const request = (query = "", repositoryId = "123") => new Request(
  `https://codaloud.test/api/github/repository/${repositoryId}/branches?${query}`,
  { headers: { Cookie: "session=current-user" } },
);
const readBranches = (query = "", repositoryId = "123") => GET(request(query, repositoryId), { repositoryId });
const expectPrivate = (response: Response) => {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ userId: "current-user" });
  mocks.listUserAccounts.mockResolvedValue([{ id: "linked-account", providerId: "github", scopes: ["repo"] }]);
  mocks.getAccessToken.mockResolvedValue({ accessToken: "private-token" });
  network.mockReset().mockImplementation(async (url) => Response.json(
    new URL(String(url)).pathname === "/repositories/123" ? repository : [branch("main")],
  ));
  vi.stubGlobal("fetch", network);
});

describe("GitHub repository branches GET route", () => {
  it("requires a session before reading credentials or contacting GitHub", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const response = await readBranches();
    expect(response.status).toBe(401);
    expectPrivate(response);
    expect(mocks.listUserAccounts).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { accounts: [] },
    { accounts: [{ id: "linked-account", providerId: "github", scopes: ["read:user"] }] },
  ])(
    "requires a connected GitHub account with repository scope: %j", async ({ accounts }) => {
      mocks.listUserAccounts.mockResolvedValue(accounts);
      const response = await readBranches();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
      expectPrivate(response);
      expect(mocks.getAccessToken).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it("requires an access token", async () => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: null });
    const response = await readBranches();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "abc", "0123", "123/branches"])("rejects invalid repository ID %s", async (id) => {
    const response = await readBranches("", id);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: true, message: "Invalid GitHub repository ID." });
    expectPrivate(response);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["page=1", "pageSize=0", "pageSize=101", "pageSize=1.5", "pageSize=abc", "cursor=", "cursor=invalid!", `search=${"a".repeat(201)}`])(
    "rejects invalid query parameters: %s", async (query) => {
      const response = await readBranches(query);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: true });
      expectPrivate(response);
      expect(mocks.getAccessToken).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it("uses session credentials, rechecks the ID, and returns only branch picker data", async () => {
    const req = request("accountId=attacker&accessToken=attacker&repositoryId=999");
    const response = await GET(req, { repositoryId: "123" });
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({ body: { accountId: "linked-account" }, headers: req.headers });
    expect(await response.json()).toEqual({
      error: false,
      message: "GitHub repository branches loaded.",
      data: { branches: [{ name: "main", commitSha: "a".repeat(40), protected: false }], nextCursor: null },
    });
    expect(network).toHaveBeenCalledTimes(2);
    expect(new URL(String(network.mock.calls[0][0])).pathname).toBe("/repositories/123");
    const url = new URL(String(network.mock.calls[1][0]));
    expect(url.pathname).toBe("/repos/current-owner/renamed/branches");
    expect(url.searchParams.get("per_page")).toBe(String(PAGE_SIZE));
    for (const [, options] of network.mock.calls) {
      expect(options?.signal).toBe(req.signal);
      expect(new Headers(options?.headers).get("authorization")).toBe("token private-token");
    }
  });

  it("searches case-insensitively and rechecks credentials and repository access for continuation", async () => {
    network.mockImplementation(async (url) => Response.json(
      new URL(String(url)).pathname === "/repositories/123"
        ? repository : [branch("main"), branch("Feature/one"), branch("feature/two")],
    ));
    const first = await (await readBranches("search=%20FEATURE/%20&pageSize=1")).json();
    expect(first.data.branches.map(({ name }: { name: string }) => name)).toEqual(["Feature/one"]);
    expect(first.data.nextCursor).toEqual(expect.any(String));
    const second = await (await readBranches(`search=feature/&pageSize=1&cursor=${first.data.nextCursor}`)).json();
    expect(second.data.branches.map(({ name }: { name: string }) => name)).toEqual(["feature/two"]);
    expect(second.data.nextCursor).toBeNull();
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(2);
    expect(network.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/repositories/123")).toHaveLength(2);

    network.mockReset().mockResolvedValue(Response.json({ ...repository, permissions: { pull: false } }));
    const revoked = await readBranches(`search=feature/&pageSize=1&cursor=${first.data.nextCursor}`);
    expect(revoked.status).toBe(403);
    expect(network).toHaveBeenCalledOnce();
  });

  it("returns an empty successful page", async () => {
    network.mockImplementation(async (url) => Response.json(new URL(String(url)).pathname === "/repositories/123" ? repository : []));
    const response = await readBranches();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ error: false, data: { branches: [], nextCursor: null } });
  });

  it("returns a cursor validation error", async () => {
    const response = await readBranches("cursor=e30");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: true, message: expect.stringMatching(/cursor/i) });
    expectPrivate(response);
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([
    { upstream: 404, expected: 403, headers: {} },
    { upstream: 403, expected: 403, headers: {} },
    { upstream: 401, expected: 403, headers: {} },
    { upstream: 429, expected: 429, headers: {} },
    { upstream: 403, expected: 429, headers: { "x-ratelimit-remaining": "0" } },
    { upstream: 500, expected: 502, headers: {} },
  ])("reuses safe GitHub errors for upstream $upstream ($expected)", async ({ upstream, expected, headers }) => {
    network.mockReset().mockResolvedValue(Response.json({ message: "secret private-token" }, { status: upstream, headers: headers as Record<string, string> }));
    const response = await readBranches();
    expect(response.status).toBe(expected);
    expectPrivate(response);
    const body = await response.json();
    expect(body.error).toBe(true);
    expect(body.code).toBe(upstream === 401 ? "GITHUB_RECONNECT_REQUIRED" : undefined);
    expect(JSON.stringify(body)).not.toMatch(/secret|private-token/);
    expect(network).toHaveBeenCalledOnce();
  });

  it("handles access disappearing between the repository lookup and branch request", async () => {
    network.mockReset()
      .mockResolvedValueOnce(Response.json(repository))
      .mockResolvedValueOnce(Response.json({ message: "Not Found" }, { status: 404 }));
    expect((await readBranches()).status).toBe(403);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("maps an expired session to the existing authentication error", async () => {
    mocks.getCurrentUser.mockRejectedValueOnce(new APIError("UNAUTHORIZED"));
    expect((await readBranches()).status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
});
