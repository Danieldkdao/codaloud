import { beforeEach, describe, expect, it, vi } from "vitest";
import { readGitHubRepositoryBranches } from "../actions/actions";

const token = vi.hoisted(() => vi.fn());
vi.mock("../credentials", () => ({ getGitHubAccessToken: token }));
const network = vi.fn<typeof fetch>();
const repository = {
  id: 123, name: "project", full_name: "owner/project", description: null,
  private: true, archived: false, default_branch: "main",
  clone_url: "https://github.com/owner/project.git", html_url: "https://github.com/owner/project",
  permissions: { pull: true, push: true, admin: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  token.mockResolvedValue("device-token");
  network.mockReset().mockImplementation(async (url) => String(url).includes("/repositories/123")
    ? Response.json(repository)
    : Response.json([{ name: "main", commit: { sha: "a".repeat(40) }, protected: false }]));
  vi.stubGlobal("fetch", network);
});

describe("device GitHub branch reads", () => {
  it("checks repository access and reads branches directly with device credentials", async () => {
    expect(await readGitHubRepositoryBranches("123")).toEqual({
      branches: [{ name: "main", commitSha: "a".repeat(40), protected: false }], nextCursor: null,
    });
    expect(network).toHaveBeenCalledTimes(2);
    for (const [url, options] of network.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://api.github.com");
      expect(new Headers(options?.headers).get("authorization")).toBe("token device-token");
      expect(new Headers(options?.headers).has("cookie")).toBe(false);
    }
  });

  it.each(["", "0", "-1", "1.5", "0123", "123/branches", "abc"])("rejects invalid repository ID %j before requesting credentials", async (id) => {
    expect(await readGitHubRepositoryBranches(id)).toBeNull();
    expect(token).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([{ pageSize: 0 }, { pageSize: 101 }, { pageSize: 1.5 }, { cursor: "" }, { cursor: "invalid!" }, { search: "a".repeat(201) }])(
    "rejects invalid pagination %j before credentials or network", async (options) => {
      expect(await readGitHubRepositoryBranches("123", options)).toBeNull();
      expect(token).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it("does not request branches when disconnected", async () => {
    token.mockRejectedValue(new Error("Connect GitHub"));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 502])("returns null for HTTP %s", async (status) => {
    network.mockResolvedValue(Response.json({ message: "Unavailable" }, { status }));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
  });

  it("checks read permission before listing branches", async () => {
    network.mockResolvedValue(Response.json({ ...repository, permissions: { pull: false } }));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid branch data and returns empty collections on successful empty reads", async () => {
    network.mockResolvedValueOnce(Response.json(repository)).mockResolvedValueOnce(Response.json([{ name: "main" }]));
    expect(await readGitHubRepositoryBranches("123")).toBeNull();
    network.mockResolvedValueOnce(Response.json(repository)).mockResolvedValueOnce(Response.json([]));
    expect(await readGitHubRepositoryBranches("123")).toEqual({ branches: [], nextCursor: null });
  });

  it("does not fetch an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await readGitHubRepositoryBranches("123", { signal: controller.signal })).toBeNull();
    expect(token).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});
