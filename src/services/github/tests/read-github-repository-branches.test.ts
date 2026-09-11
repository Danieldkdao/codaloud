import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_SIZE } from "@/lib/constants";
import { readGitHubRepositoryBranches } from "@/services/github/actions/actions";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getCookie: vi.fn() }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: mocks }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://api.codaloud.test/" }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

const network = vi.fn<typeof fetch>();
const page = {
  branches: [{ name: "Feature/one", commitSha: "a".repeat(40), protected: false }],
  nextCursor: "next-cursor",
};
const success = (data: unknown = page) => ({ error: false, message: "GitHub repository branches loaded.", data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { user: { id: "user-1" }, session: { id: "session-1" } }, error: null });
  mocks.getCookie.mockResolvedValue("session=mobile");
  network.mockReset().mockImplementation(async () => Response.json(success()));
  vi.stubGlobal("fetch", network);
});

describe("readGitHubRepositoryBranches", () => {
  it("sends a GET with the native session cookie and default pagination", async () => {
    expect(await readGitHubRepositoryBranches("123")).toEqual(page);
    const [url, options] = network.mock.calls[0];
    expect(url).toBe(`https://api.codaloud.test/api/github/repository/123/branches?pageSize=${PAGE_SIZE}`);
    expect(options?.method).toBe("GET");
    expect(options?.credentials).toBe("omit");
    expect(options?.body).toBeUndefined();
    expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
    expect(new Headers(options?.headers).get("Accept")).toBe("application/json");
  });

  it("encodes search and forwards the cursor, page size, and cancellation signal", async () => {
    const controller = new AbortController();
    await readGitHubRepositoryBranches("123", {
      search: "  Feature/a & b  ", pageSize: 3, cursor: "previous-cursor", signal: controller.signal,
    });
    const [url, options] = network.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(Object.fromEntries(query)).toEqual({ search: "Feature/a & b", pageSize: "3", cursor: "previous-cursor" });
    expect(options?.signal).toBe(controller.signal);
  });

  it.each(["", "0", "-1", "1.5", "0123", "123/branches", "abc"])("rejects invalid repository ID %j before authentication or fetch", async (id) => {
    expect(await readGitHubRepositoryBranches(id)).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([{ pageSize: 0 }, { pageSize: 101 }, { pageSize: 1.5 }, { cursor: "" }, { cursor: "invalid!" }, { search: "a".repeat(201) }])(
    "rejects invalid pagination %j before authentication or fetch", async (options) => {
      expect(await readGitHubRepositoryBranches("123", options)).toBeNull();
      expect(mocks.getSession).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it.each([
    { data: null, error: null },
    { data: { user: { id: "user-1" } }, error: { message: "Session expired" } },
  ])("does not request branches without a valid session: %j", async (session) => {
    mocks.getSession.mockResolvedValue(session);
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
    expect(mocks.getCookie).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 502])("returns null for HTTP %s", async (status) => {
    network.mockResolvedValue(Response.json(success(), { status }));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
  });

  it.each([
    null,
    { data: page },
    { error: true, message: "Denied", data: page },
    { error: "false", message: "Loaded", data: page },
    success({ branches: [] }),
    success({ branches: [], nextCursor: 1 }),
    success({ branches: [], nextCursor: "invalid!" }),
    success({ branches: [{ name: "main" }], nextCursor: null }),
    success({ branches: [{ ...page.branches[0], protected: "false" }], nextCursor: null }),
  ])("returns null for malformed or unsuccessful response %j", async (payload) => {
    network.mockResolvedValue(Response.json(payload));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
  });

  it.each([null, "next-cursor"])("preserves empty pages with continuation %j", async (nextCursor) => {
    network.mockResolvedValue(Response.json(success({ branches: [], nextCursor })));
    expect(await readGitHubRepositoryBranches("123")).toEqual({ branches: [], nextCursor });
  });

  it("rejects a cursor that does not advance", async () => {
    expect(await readGitHubRepositoryBranches("123", { cursor: "next-cursor" })).toBeNull();
  });

  it("strips unexpected response fields", async () => {
    network.mockResolvedValue(Response.json(success({ ...page, extra: true, branches: [{ ...page.branches[0], extra: true }] })));
    expect(await readGitHubRepositoryBranches("123")).toEqual(page);
  });

  it("returns null for invalid JSON", async () => {
    network.mockResolvedValue(new Response("not JSON"));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
  });

  it.each(["session", "headers", "network", "abort"])("returns null when %s fails", async (stage) => {
    const error = new Error("Request failed");
    if (stage === "session") mocks.getSession.mockRejectedValueOnce(error);
    if (stage === "headers") mocks.getCookie.mockRejectedValueOnce(error);
    if (stage === "network") network.mockRejectedValueOnce(error);
    if (stage === "abort") network.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
  });
});
