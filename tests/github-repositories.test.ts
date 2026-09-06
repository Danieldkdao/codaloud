import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { GET } from "@/app/api/github/repositories+api";
import { readGitHubRepositories } from "@/features/projects/actions/actions";
import { DEFAULT_PAGE, PAGE_SIZE } from "@/lib/constants";
import { listGitHubRepositories } from "@/services/github/repositories";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listUserAccounts: vi.fn(),
  getAccessToken: vi.fn(),
  getCookie: vi.fn(),
  platform: { OS: "web" },
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: {
    listUserAccounts: mocks.listUserAccounts,
    getAccessToken: mocks.getAccessToken,
  } },
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: mocks.getCookie },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => mocks.platform.OS === "web" ? undefined : "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: vi.fn() } }));

const network = vi.fn<typeof fetch>();
const githubRepository = (id: number) => ({
  id,
  name: `repo-${id}`,
  full_name: `owner/repo-${id}`,
  description: null,
  private: true,
  archived: false,
  default_branch: "main",
  clone_url: `https://github.com/owner/repo-${id}.git`,
  html_url: `https://github.com/owner/repo-${id}`,
  permissions: { pull: true, push: false, admin: false },
  temp_clone_token: "must-not-be-returned",
});

const request = (query = "") => new Request(
  `https://codaloud.test/api/github/repositories${query ? `?${query}` : ""}`,
  { headers: { Cookie: "codaloud-session=current-user" } },
);

beforeEach(() => {
  mocks.platform.OS = "web";
  mocks.getCurrentUser.mockResolvedValue({ userId: "current-user" });
  mocks.listUserAccounts.mockResolvedValue([
    { id: "local-account-id", providerId: "github", scopes: ["repo"] },
  ]);
  mocks.getAccessToken.mockResolvedValue({ accessToken: "private-token" });
  mocks.getCookie.mockResolvedValue("session=mobile");
  network.mockReset();
  network.mockImplementation(async () => Response.json([githubRepository(1)]));
  vi.stubGlobal("fetch", network);
});

describe("repository API authorization and pagination", () => {
  it("requires a session before reading accounts or contacting GitHub", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listUserAccounts).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [{ providerId: "github", scopes: ["read:user"] }],
    [{ providerId: "github", scopes: ["public_repo"] }],
    [{ providerId: "google", scopes: ["repo"] }],
  ])("requires a GitHub account with the repo grant: %j", async (...accounts) => {
    mocks.listUserAccounts.mockResolvedValue(accounts);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    "page=0", "page=-1", "page=1.5", "page=abc", "page=", "page=Infinity",
    "page=9007199254740992", "pageSize=0", "pageSize=-1", "pageSize=101",
    "pageSize=2.5", "pageSize=abc", "pageSize=",
  ])("rejects invalid pagination before GitHub is called: %s", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/^Page(?: size)? must be/);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { query: "page=0", message: "Page must be at least 1." },
    { query: "pageSize=101", message: "Page size must be at most 100." },
  ])("returns the schema's validation message for $query", async ({ query, message }) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: true, message });
  });

  it("uses the session's account and default pagination, keeping credentials private", async () => {
    const req = request("userId=another-user&accountId=another-account");
    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: { accountId: "local-account-id" }, headers: req.headers,
    });
    const [url, options] = network.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(query.get("page")).toBe(String(DEFAULT_PAGE));
    expect(query.get("per_page")).toBe(String(PAGE_SIZE));
    expect(new Headers(options?.headers).get("authorization")).toBe("token private-token");
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ id: 1, fullName: "owner/repo-1", permissions: { pull: true, push: false } });
    expect(JSON.stringify(body)).not.toMatch(/private-token|must-not-be-returned/);
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("supports the maximum page size and empty pages", async () => {
    network.mockResolvedValue(Response.json([]));
    const response = await GET(request("page=99&pageSize=100"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
    expect(new URL(String(network.mock.calls[0][0])).searchParams.get("per_page")).toBe("100");
  });

  it("handles empty credentials and token refresh failures", async () => {
    mocks.getAccessToken.mockResolvedValueOnce({ accessToken: "" });
    expect((await GET(request())).status).toBe(403);
    mocks.getAccessToken.mockRejectedValueOnce(new APIError("BAD_REQUEST", {
      code: "FAILED_TO_GET_ACCESS_TOKEN", message: "private upstream details",
    }));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect((await response.json()).message).toMatch(/Reconnect GitHub/);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { upstream: 401, headers: {}, expected: 403 },
    { upstream: 403, headers: {}, expected: 403 },
    { upstream: 403, headers: { "x-ratelimit-remaining": "0" }, expected: 429 },
    { upstream: 403, headers: { "retry-after": "30" }, expected: 429 },
    { upstream: 429, headers: {}, expected: 429 },
    { upstream: 500, headers: {}, expected: 502 },
  ])("returns a safe error for GitHub $upstream ($expected)", async ({ upstream, headers, expected }) => {
    network.mockImplementation(async () => Response.json(
      { message: "secret upstream details" },
      { status: upstream, headers: headers as Record<string, string> },
    ));
    const response = await GET(request());
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toMatch(/secret/);
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe("single-page GitHub service", () => {
  it("does not follow the next-page link", async () => {
    const controller = new AbortController();
    network.mockImplementation(async () => Response.json([githubRepository(21)], {
      headers: { link: '<https://api.github.com/user/repos?page=3>; rel="next"' },
    }));
    const repositories = await listGitHubRepositories("private-token", controller.signal, { page: 2 });
    expect(repositories.map((repository) => repository.id)).toEqual([21]);
    expect(network).toHaveBeenCalledTimes(1);
    const [url, options] = network.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("page")).toBe("2");
    expect(new URL(String(url)).searchParams.get("per_page")).toBe(String(PAGE_SIZE));
    expect(options?.signal).toBe(controller.signal);
  });

  it("applies the default page when only pageSize is provided", async () => {
    await listGitHubRepositories("private-token", undefined, { pageSize: 7 });
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("page")).toBe(String(DEFAULT_PAGE));
    expect(query.get("per_page")).toBe("7");
  });
});

describe("readGitHubRepositories", () => {
  it("passes pagination through the real action, route, and Octokit service", async () => {
    network.mockImplementation(async (url, options) => {
      if (String(url).startsWith("/api/github/repositories")) {
        return GET(new Request(`https://codaloud.test${url}`, options));
      }
      const query = new URL(String(url)).searchParams;
      expect(query.get("page")).toBe("3");
      expect(query.get("per_page")).toBe("2");
      return Response.json([githubRepository(5), githubRepository(6)], {
        headers: { link: '<https://api.github.com/user/repos?page=4>; rel="next"' },
      });
    });
    const repositories = await readGitHubRepositories({ page: 3, pageSize: 2 });
    expect(repositories.map((repository) => repository.id)).toEqual([5, 6]);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each(["ios", "web"])("uses the correct session transport on %s", async (os) => {
    mocks.platform.OS = os;
    const controller = new AbortController();
    network.mockResolvedValue(Response.json({ error: false, data: [] }));
    expect(await readGitHubRepositories({ signal: controller.signal })).toEqual([]);
    const [url, options] = network.mock.calls[0];
    const expectedPath = `/api/github/repositories?page=${DEFAULT_PAGE}&pageSize=${PAGE_SIZE}`;
    expect(url).toBe(os === "web" ? expectedPath : `https://api.codaloud.test${expectedPath}`);
    expect(new Headers(options?.headers).get("Cookie")).toBe(os === "web" ? null : "session=mobile");
    expect(options?.credentials).toBe(os === "web" ? "same-origin" : "omit");
    expect(options?.signal).toBe(controller.signal);
  });

  it("preserves defaults when only one pagination option is supplied", async () => {
    network.mockImplementation(async () => Response.json({ error: false, data: [] }));
    await readGitHubRepositories({ page: 4 });
    await readGitHubRepositories({ pageSize: 8 });
    expect(network.mock.calls[0][0]).toBe(`/api/github/repositories?page=4&pageSize=${PAGE_SIZE}`);
    expect(network.mock.calls[1][0]).toBe(`/api/github/repositories?page=${DEFAULT_PAGE}&pageSize=8`);
  });

  it("throws API errors with their HTTP status", async () => {
    network.mockResolvedValue(Response.json({ error: true, message: "Connect GitHub first." }, { status: 403 }));
    await expect(readGitHubRepositories()).rejects.toMatchObject({ message: "Connect GitHub first.", status: 403 });
  });

  it("rejects malformed responses", async () => {
    network.mockResolvedValueOnce(new Response("Unavailable", { status: 502 }));
    await expect(readGitHubRepositories()).rejects.toMatchObject({ message: "Unable to read the repository response.", status: 502 });
    network.mockResolvedValueOnce(Response.json({ error: false }));
    await expect(readGitHubRepositories()).rejects.toThrow(/invalid repository response/);
  });

  it("preserves abort errors", async () => {
    const abort = new DOMException("Cancelled", "AbortError");
    network.mockRejectedValue(abort);
    await expect(readGitHubRepositories()).rejects.toBe(abort);
  });
});


describe("repository search", () => {
  it("passes encoded search through the action and route, matching names and descriptions before pagination", async () => {
    network.mockImplementation(async (url, options) => {
      if (String(url).startsWith("/api/github/repositories")) {
        expect(new URL(String(url), "https://codaloud.test").searchParams.get("search")).toBe("  CLOUD & code  ");
        return GET(new Request(`https://codaloud.test${url}`, options));
      }
      const query = new URL(String(url)).searchParams;
      expect(new URL(String(url)).pathname).toBe("/user/repos");
      if (query.get("page") === "1") {
        return Response.json([
          { ...githubRepository(1), name: "cloud & code-first" },
          githubRepository(2),
        ], { headers: { link: '<https://api.github.com/user/repos?page=2&per_page=100>; rel="next"' } });
      }
      return Response.json([
        { ...githubRepository(3), description: "My Cloud & Code workspace" },
        { ...githubRepository(4), name: "cloud & code-last" },
      ]);
    });
    const result = await readGitHubRepositories({ search: "  CLOUD & code  ", page: 2, pageSize: 1 });
    expect(result.map((repository) => repository.id)).toEqual([3]);
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("continues through pages with no matches and returns an empty result when exhausted", async () => {
    network.mockResolvedValueOnce(Response.json([githubRepository(1)], {
      headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
    })).mockResolvedValueOnce(Response.json([githubRepository(2)]));
    expect(await listGitHubRepositories("token", undefined, { search: "missing" })).toEqual([]);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("stops scanning once the requested matching page is full", async () => {
    network.mockResolvedValue(Response.json([githubRepository(1)], {
      headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
    }));
    expect(await listGitHubRepositories("token", undefined, { search: "REPO", pageSize: 1 })).toHaveLength(1);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("treats whitespace-only search as ordinary pagination", async () => {
    await GET(request("search=%20%20&page=3&pageSize=7"));
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("page")).toBe("3");
    expect(query.get("per_page")).toBe("7");
  });

  it("rejects an oversized search before calling GitHub", async () => {
    const response = await GET(request(`search=${"a".repeat(201)}`));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/Search/);
    expect(network).not.toHaveBeenCalled();
  });
});
