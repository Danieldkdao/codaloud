import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { GET } from "@/app/api/github/repositories+api";
import { readGitHubRepositories } from "@/services/github/actions/actions";
import { DEFAULT_PAGE, PAGE_SIZE } from "@/lib/constants";
import { listGitHubRepositoryPage } from "@/services/github/server/repositories";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listUserAccounts: vi.fn(),
  getAccessToken: vi.fn(),
  getCookie: vi.fn(),
  platform: { OS: "ios" },
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      listUserAccounts: mocks.listUserAccounts,
      getAccessToken: mocks.getAccessToken,
    },
  },
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: mocks.getCookie },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({
  Platform: mocks.platform,
  Alert: { alert: vi.fn() },
}));

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

const request = (query = "") =>
  new Request(
    `https://codaloud.test/api/github/repositories${query ? `?${query}` : ""}`,
    { headers: { Cookie: "codaloud-session=current-user" } },
  );

beforeEach(() => {
  mocks.platform.OS = "ios";
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
  it.each(["read:user, user:email", "public_repo", ""])(
    "requests reconnection when the live token lacks repo access despite saved scopes: %s",
    async (scopes) => {
      network.mockResolvedValue(Response.json([{ ...githubRepository(1), private: false }], {
        headers: { "x-oauth-scopes": scopes },
      }));
      const response = await GET(request());
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
    },
  );

  it("returns public and private repositories when the live token has repo access", async () => {
    network.mockResolvedValue(Response.json([
      { ...githubRepository(1), private: false }, githubRepository(2),
    ], { headers: { "x-oauth-scopes": "read:user, repo, user:email" } }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data.repositories.map(({ private: isPrivate }: { private: boolean }) => isPrivate)).toEqual([false, true]);
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("visibility")).toBe("all");
    expect(query.get("affiliation")).toBe("owner,collaborator,organization_member");
  });

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
  ])(
    "requires a GitHub account with the repo grant: %j",
    async (...accounts) => {
      mocks.listUserAccounts.mockResolvedValue(accounts);
      expect((await GET(request())).status).toBe(403);
      expect(mocks.getAccessToken).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it.each([
    "pageSize=0",
    "pageSize=-1",
    "pageSize=101",
    "pageSize=2.5",
    "pageSize=abc",
    "pageSize=",
  ])(
    "rejects invalid pagination before GitHub is called: %s",
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(
        /^Page(?: size)? must be/,
      );
      expect(mocks.getAccessToken).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it.each([
    { query: "page=2", message: "Use a repository cursor instead of a page number." },
    { query: "pageSize=101", message: "Page size must be at most 100." },
  ])(
    "returns the schema's validation message for $query",
    async ({ query, message }) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: true, message });
    },
  );

  it("uses the session's account and default pagination, keeping credentials private", async () => {
    const req = request("userId=another-user&accountId=another-account");
    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: { accountId: "local-account-id" },
      headers: req.headers,
    });
    const [url, options] = network.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(query.get("page")).toBe(String(DEFAULT_PAGE));
    expect(query.get("per_page")).toBe(String(PAGE_SIZE));
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "token private-token",
    );
    const body = await response.json();
    expect(body.data.repositories[0]).toMatchObject({
      id: 1,
      fullName: "owner/repo-1",
      permissions: { pull: true, push: false },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /private-token|must-not-be-returned/,
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("supports the maximum page size and empty pages", async () => {
    network.mockResolvedValue(Response.json([]));
    const response = await GET(request("pageSize=100"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ repositories: [], nextCursor: null });
    expect(
      new URL(String(network.mock.calls[0][0])).searchParams.get("per_page"),
    ).toBe("100");
  });

  it("handles empty credentials and token refresh failures", async () => {
    mocks.getAccessToken.mockResolvedValueOnce({ accessToken: "" });
    expect((await GET(request())).status).toBe(403);
    mocks.getAccessToken.mockRejectedValueOnce(
      new APIError("BAD_REQUEST", {
        code: "FAILED_TO_GET_ACCESS_TOKEN",
        message: "private upstream details",
      }),
    );
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
  ])(
    "returns a safe error for GitHub $upstream ($expected)",
    async ({ upstream, headers, expected }) => {
      network.mockImplementation(async () =>
        Response.json(
          { message: "secret upstream details" },
          { status: upstream, headers: headers as Record<string, string> },
        ),
      );
      const response = await GET(request());
      expect(response.status).toBe(expected);
      expect(await response.text()).not.toMatch(/secret/);
      expect(network).toHaveBeenCalledTimes(1);
    },
  );
});

describe("single-page GitHub service", () => {
  it("does not follow the next-page link", async () => {
    const controller = new AbortController();
    network.mockImplementation(async () =>
      Response.json([githubRepository(21)], {
        headers: {
          link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        },
      }),
    );
    const repositories = await listGitHubRepositoryPage(
      "private-token",
      controller.signal,
      {},
    );
    expect(repositories.repositories.map((repository) => repository.id)).toEqual([21]);
    expect(network).toHaveBeenCalledTimes(1);
    const [url, options] = network.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("page")).toBe("1");
    expect(new URL(String(url)).searchParams.get("per_page")).toBe(
      String(PAGE_SIZE),
    );
    expect(options?.signal).toBe(controller.signal);
  });

  it("applies the default page when only pageSize is provided", async () => {
    await listGitHubRepositoryPage("private-token", undefined, { pageSize: 7 });
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("page")).toBe(String(DEFAULT_PAGE));
    expect(query.get("per_page")).toBe("7");
  });
});

describe("readGitHubRepositories", () => {
  it("passes continuation through the real action, route, and Octokit service", async () => {
    const upstreamPages: string[] = [];
    network.mockImplementation(async (url, options) => {
      if (String(url).startsWith("https://api.codaloud.test/api/github/repositories")) {
        expect(new URL(String(url), "https://codaloud.test").searchParams.has("page")).toBe(false);
        return GET(new Request(url, options));
      }
      const query = new URL(String(url)).searchParams;
      upstreamPages.push(query.get("page")!);
      expect(query.get("per_page")).toBe("2");
      const page = Number(query.get("page"));
      return Response.json([githubRepository(page * 2 - 1), githubRepository(page * 2)], {
        headers: page === 1 ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {},
      });
    });
    const first = await readGitHubRepositories({ pageSize: 2 });
    expect(first.repositories.map((repository) => repository.id)).toEqual([1, 2]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await readGitHubRepositories({ pageSize: 2, cursor: first.nextCursor });
    expect(second.repositories.map((repository) => repository.id)).toEqual([3, 4]);
    expect(second.nextCursor).toBeNull();
    expect(upstreamPages).toEqual(["1", "2"]);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it.each(["ios", "android"])(
    "uses the correct session transport on %s",
    async (os) => {
      mocks.platform.OS = os;
      const controller = new AbortController();
      network.mockResolvedValue(Response.json({ error: false, data: { repositories: [], nextCursor: null } }));
      expect(
        await readGitHubRepositories({ signal: controller.signal }),
      ).toEqual({ repositories: [], nextCursor: null });
      const [url, options] = network.mock.calls[0];
      const expectedPath = `/api/github/repositories?pageSize=${PAGE_SIZE}`;
      expect(url).toBe(`https://api.codaloud.test${expectedPath}`);
      expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
      expect(options?.credentials).toBe("omit");
      expect(options?.signal).toBe(controller.signal);
    },
  );

  it("omits the first cursor and forwards an opaque continuation unchanged", async () => {
    network.mockImplementation(async () => Response.json({ error: false, data: { repositories: [], nextCursor: null } }));
    await readGitHubRepositories({ pageSize: 8 });
    await readGitHubRepositories({ cursor: "opaque-cursor", pageSize: 8 });
    const queries = network.mock.calls.map(([url]) => new URL(String(url), "https://codaloud.test").searchParams);
    expect(queries[0].has("cursor")).toBe(false);
    expect(queries[1].get("cursor")).toBe("opaque-cursor");
    expect(queries[1].get("pageSize")).toBe("8");
  });

  it("throws API errors with their HTTP status", async () => {
    network.mockResolvedValue(
      Response.json(
        { error: true, message: "Connect GitHub first." },
        { status: 403 },
      ),
    );
    await expect(readGitHubRepositories()).rejects.toMatchObject({
      message: "Connect GitHub first.",
      status: 403,
    });
  });

  it("rejects malformed responses", async () => {
    network.mockResolvedValueOnce(new Response("Unavailable", { status: 502 }));
    await expect(readGitHubRepositories()).rejects.toMatchObject({
      message: "Unable to read the repository response.",
      status: 502,
    });
    network.mockResolvedValueOnce(Response.json({ error: false }));
    await expect(readGitHubRepositories()).rejects.toThrow(
      /invalid repository response/,
    );
  });

  it("preserves abort errors", async () => {
    const abort = new DOMException("Cancelled", "AbortError");
    network.mockRejectedValue(abort);
    await expect(readGitHubRepositories()).rejects.toBe(abort);
  });
});

describe("repository search", () => {
  it("matches full names through the action and API while continuing across GitHub pages", async () => {
    const scannedPages: number[] = [];
    const search = "  ACME/REPO-  ";
    network.mockImplementation(async (url, options) => {
      if (String(url).startsWith("https://api.codaloud.test/api/github/repositories")) {
        return GET(new Request(url, options));
      }
      const page = Number(new URL(String(url)).searchParams.get("page"));
      scannedPages.push(page);
      return Response.json([
        githubRepository(page * 2 - 1),
        { ...githubRepository(page * 2), full_name: `Acme/repo-${page * 2}` },
      ], {
        headers: page === 1
          ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' }
          : {},
      });
    });
    const first = await readGitHubRepositories({ search, pageSize: 1 });
    expect(first.repositories.map(({ fullName }) => fullName)).toEqual(["Acme/repo-2"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await readGitHubRepositories({ search, pageSize: 1, cursor: first.nextCursor });
    expect(second.repositories.map(({ fullName }) => fullName)).toEqual(["Acme/repo-4"]);
    expect(second.nextCursor).toBeNull();
    expect(scannedPages).toEqual([1, 2]);
  });

  it("passes encoded search through the action and route, matching names and descriptions before pagination", async () => {
    network.mockImplementation(async (url, options) => {
      if (String(url).startsWith("https://api.codaloud.test/api/github/repositories")) {
        expect(
          new URL(String(url), "https://codaloud.test").searchParams.get(
            "search",
          ),
        ).toBe("  CLOUD & code  ");
        return GET(new Request(url, options));
      }
      const query = new URL(String(url)).searchParams;
      expect(new URL(String(url)).pathname).toBe("/user/repos");
      if (query.get("page") === "1") {
        return Response.json(
          [
            { ...githubRepository(1), name: "cloud & code-first" },
            githubRepository(2),
          ],
          {
            headers: {
              link: '<https://api.github.com/user/repos?page=2&per_page=100>; rel="next"',
            },
          },
        );
      }
      return Response.json([
        { ...githubRepository(3), description: "My Cloud & Code workspace" },
        { ...githubRepository(4), name: "cloud & code-last" },
      ]);
    });
    const first = await readGitHubRepositories({ search: "  CLOUD & code  ", pageSize: 1 });
    const result = await readGitHubRepositories({ search: "  CLOUD & code  ", pageSize: 1, cursor: first.nextCursor });
    expect(first.repositories.map((repository) => repository.id)).toEqual([1]);
    expect(result.repositories.map((repository) => repository.id)).toEqual([3]);
    expect(network).toHaveBeenCalledTimes(5);
  });

  it("continues through pages with no matches and returns an empty result when exhausted", async () => {
    network
      .mockResolvedValueOnce(
        Response.json([githubRepository(1)], {
          headers: {
            link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(Response.json([githubRepository(2)]));
    expect(
      await listGitHubRepositoryPage("token", undefined, { search: "missing" }),
    ).toEqual({ repositories: [], nextCursor: null });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("stops scanning once the requested matching page is full", async () => {
    network.mockResolvedValue(
      Response.json([githubRepository(1)], {
        headers: {
          link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        },
      }),
    );
    expect(
      await listGitHubRepositoryPage("token", undefined, {
        search: "REPO",
        pageSize: 1,
      }),
    ).toMatchObject({ repositories: [{ id: 1 }] });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("treats whitespace-only search as ordinary pagination", async () => {
    await GET(request("search=%20%20&pageSize=7"));
    const query = new URL(String(network.mock.calls[0][0])).searchParams;
    expect(query.get("page")).toBe("1");
    expect(query.get("per_page")).toBe("7");
  });

  it("rejects an oversized search before calling GitHub", async () => {
    const response = await GET(request(`search=${"a".repeat(201)}`));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/Search/);
    expect(network).not.toHaveBeenCalled();
  });
});


describe("repository authentication error contract", () => {
  it.each([
    { status: 401, headers: {}, code: "GITHUB_RECONNECT_REQUIRED" },
    { status: 403, headers: {}, code: undefined },
    { status: 403, headers: { "x-ratelimit-remaining": "0" }, code: undefined },
  ])("distinguishes credential rejection from permission and rate-limit failures: %j", async ({ status, headers, code }) => {
    network.mockImplementation(async () => Response.json({ message: "upstream failure" }, { status, headers: headers as Record<string, string> }));
    const response = await GET(request());
    expect((await response.json()).code).toBe(code);
  });
});


it("preserves the reconnect code through the real repository action and route", async () => {
  network.mockImplementation(async (url, options) => {
    if (String(url).startsWith("https://api.codaloud.test/api/github/repositories")) {
      return GET(new Request(url, options));
    }
    return Response.json({ message: "Bad credentials" }, { status: 401 });
  });
  await expect(readGitHubRepositories()).rejects.toMatchObject({ status: 403, code: "GITHUB_RECONNECT_REQUIRED" });
});

it("does not restart completed GitHub pages when loading the next search page", async () => {
  network.mockImplementation(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return Response.json([{ ...githubRepository(page), name: "match" }], {
      headers: page < 2 ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {},
    });
  });
  const first = await listGitHubRepositoryPage("token", undefined, { search: "match", pageSize: 1 });
  await listGitHubRepositoryPage("token", undefined, { search: "match", pageSize: 1, cursor: first.nextCursor });
  expect(network.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("page"))).toEqual(["1", "2"]);
});


describe("cursor API contract", () => {
  it.each(["", "e30", "invalid!", "x".repeat(2049)])("rejects malformed cursors safely: %s", async (cursor) => {
    const response = await GET(request(`cursor=${encodeURIComponent(cursor)}`));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/cursor/i);
    expect(network).not.toHaveBeenCalled();
  });

  it("requires a fresh cursor when the search or page size changes", async () => {
    network.mockImplementation(async () => Response.json([githubRepository(1)], {
      headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
    }));
    const first = await (await GET(request("search=repo&pageSize=1"))).json();
    network.mockClear();
    for (const query of ["search=other&pageSize=1", "search=repo&pageSize=2"]) {
      const response = await GET(request(`${query}&cursor=${first.data.nextCursor}`));
      expect(response.status).toBe(400);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("resolves credentials again for each continuation, even across sessions", async () => {
    network.mockImplementation(async () => Response.json([githubRepository(1)], {
      headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
    }));
    const first = await (await GET(request())).json();
    mocks.getCurrentUser.mockResolvedValue({ userId: "second-user" });
    mocks.listUserAccounts.mockResolvedValue([{ id: "second-account", providerId: "github", scopes: ["repo"] }]);
    mocks.getAccessToken.mockResolvedValue({ accessToken: "second-token" });
    await GET(request(`cursor=${first.data.nextCursor}`));
    expect(mocks.getAccessToken).toHaveBeenLastCalledWith(expect.objectContaining({ body: { accountId: "second-account" } }));
    expect(new Headers(network.mock.lastCall?.[1]?.headers).get("authorization")).toBe("token second-token");
  });

  it.each([
    [],
    { repositories: [] },
    { repositories: [], nextCursor: 1 },
    { repositories: [{ id: 1 }], nextCursor: null },
  ])("rejects incompatible successful responses: %j", async (data) => {
    network.mockResolvedValue(Response.json({ error: false, data }));
    await expect(readGitHubRepositories()).rejects.toThrow(/invalid repository response/);
  });
});


it("continues an empty bounded search through the real action and API", async () => {
  const scannedPages: number[] = [];
  network.mockImplementation(async (url, options) => {
    if (String(url).startsWith("https://api.codaloud.test/api/github/repositories")) {
      return GET(new Request(url, options));
    }
    const page = Number(new URL(String(url)).searchParams.get("page"));
    scannedPages.push(page);
    return Response.json([{ ...githubRepository(page), name: page === 6 ? "match" : "other" }], {
      headers: page < 6 ? { link: `<https://api.github.com/user/repos?page=${page + 1}>; rel="next"` } : {},
    });
  });
  const first = await readGitHubRepositories({ search: "match" });
  expect(first.repositories).toEqual([]);
  expect(first.nextCursor).toEqual(expect.any(String));
  expect(scannedPages).toEqual([1, 2, 3, 4, 5]);
  const next = await readGitHubRepositories({ search: "match", cursor: first.nextCursor });
  expect(next.repositories.map(({ id }) => id)).toEqual([6]);
  expect(next.nextCursor).toBeNull();
  expect(scannedPages).toEqual([1, 2, 3, 4, 5, 6]);
});

it("rejects a non-advancing continuation instead of requesting it forever", async () => {
  network.mockResolvedValue(Response.json({ error: false, data: { repositories: [], nextCursor: "same-cursor" } }));
  await expect(readGitHubRepositories({ cursor: "same-cursor" })).rejects.toThrow(/invalid repository response/);
  expect(network).toHaveBeenCalledOnce();
});
