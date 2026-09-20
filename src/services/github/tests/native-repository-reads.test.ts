import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readGitHubRepositories,
  readGitHubRepositoryBranches,
} from "../actions/actions";

// Use the same AbortController implementation installed by React Native, rather
// than Node's richer API, so this exercises the actual mobile cancellation seam.
const nativeRequire = createRequire(
  import.meta.resolve("react-native/package.json"),
);
const NativeAbortController = nativeRequire("abort-controller")
  .AbortController as typeof AbortController;
const fetchGitHub = vi.fn<typeof fetch>();
vi.mock("../credentials", () => ({
  getGitHubAccessToken: async () => "test-device-token",
}));

const repository = {
  id: 42,
  name: "mobile",
  full_name: "developer/mobile",
  description: null,
  private: true,
  archived: false,
  default_branch: "main",
  clone_url: "https://github.com/developer/mobile.git",
  html_url: "https://github.com/developer/mobile",
  permissions: { pull: true, push: true, admin: true },
};
const response = (data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "x-oauth-scopes": "repo, read:user",
      ...headers,
    },
  });

beforeEach(() => {
  fetchGitHub
    .mockReset()
    .mockImplementation(async () => response([repository]));
  vi.stubGlobal("fetch", fetchGitHub);
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["Node", AbortController],
  ["React Native", NativeAbortController],
] as const)(
  "loads connected repositories automatically with a %s query signal",
  async (_runtime, Controller) => {
    const controller = new Controller();
    const page = await readGitHubRepositories({ signal: controller.signal });
    expect(page?.repositories.map(({ id }) => id)).toEqual([42]);
    expect(fetchGitHub).toHaveBeenCalledOnce();
    expect(new Headers(fetchGitHub.mock.calls[0][1]?.headers).get("x-github-api-version")).toBe("2026-03-10");
  },
);

it("loads subsequent repository pages with the native signal", async () => {
  fetchGitHub
    .mockResolvedValueOnce(
      response([repository], {
        link: '<https://api.github.com/user/repos?page=2>; rel="next"',
      }),
    )
    .mockResolvedValueOnce(response([{ ...repository, id: 43 }]));
  const signal = new NativeAbortController().signal;
  const first = await readGitHubRepositories({ pageSize: 1, signal });
  expect(first?.nextCursor).toEqual(expect.any(String));
  const second = await readGitHubRepositories({
    pageSize: 1,
    cursor: first!.nextCursor,
    signal,
  });
  expect(second?.repositories.map(({ id }) => id)).toEqual([43]);
  expect(second?.nextCursor).toBeNull();
  for (const [, request] of fetchGitHub.mock.calls)
    expect(new Headers(request?.headers).get("x-github-api-version")).toBe("2026-03-10");
});

it("loads repository branches with the native signal", async () => {
  fetchGitHub
    .mockResolvedValueOnce(response(repository))
    .mockResolvedValueOnce(
      response([
        { name: "main", commit: { sha: "a".repeat(40) }, protected: false },
      ]),
    );
  const page = await readGitHubRepositoryBranches("42", {
    signal: new NativeAbortController().signal,
  });
  expect(page?.branches.map(({ name }) => name)).toEqual(["main"]);
  for (const [, request] of fetchGitHub.mock.calls)
    expect(new Headers(request?.headers).get("x-github-api-version")).toBe("2026-03-10");
});

it("does not request repositories after a native signal is cancelled", async () => {
  const controller = new NativeAbortController();
  controller.abort();
  expect(
    await readGitHubRepositories({ signal: controller.signal }),
  ).toBeNull();
  expect(fetchGitHub).not.toHaveBeenCalled();
});

it("discards a response if the native query was cancelled during the request", async () => {
  const controller = new NativeAbortController();
  fetchGitHub.mockImplementationOnce(async () => {
    controller.abort();
    return response([repository]);
  });
  expect(
    await readGitHubRepositories({ signal: controller.signal }),
  ).toBeNull();
  expect(fetchGitHub).toHaveBeenCalledOnce();
});

it.each([true, false])("creates a GitHub repository with private=%s and no generated initial commit", async (isPrivate) => {
  const { createGitHubRepository } = await import("../server/repositories");
  fetchGitHub.mockResolvedValueOnce(response({ ...repository, private: isPrivate }));
  expect(await createGitHubRepository("test-device-token", {
    name: "mobile", description: "A local project", private: isPrivate,
  })).toMatchObject({ id: 42, private: isPrivate, cloneUrl: repository.clone_url });
  const [url, request] = fetchGitHub.mock.calls[0];
  expect(String(url)).toBe("https://api.github.com/user/repos");
  expect(request?.method).toBe("POST");
  expect(new Headers(request?.headers).get("x-github-api-version")).toBe("2026-03-10");
  expect(JSON.parse(String(request?.body))).toEqual({ name: "mobile", description: "A local project", private: isPrivate, auto_init: false });
});


it("versions branch verification requests before importing a repository", async () => {
  const { verifyGitHubRepositoryBranch } = await import("../server/repositories");
  fetchGitHub.mockResolvedValueOnce(response({ name: "main", commit: { sha: "a".repeat(40) } }));
  await verifyGitHubRepositoryBranch("test-device-token", {
    id: 42, name: "mobile", fullName: "developer/mobile", description: null,
    private: true, archived: false, defaultBranch: "main",
    cloneUrl: repository.clone_url, htmlUrl: repository.html_url,
    permissions: repository.permissions,
  }, "main");
  expect(String(fetchGitHub.mock.calls[0][0])).toBe("https://api.github.com/repos/developer/mobile/branches/main");
  expect(new Headers(fetchGitHub.mock.calls[0][1]?.headers).get("x-github-api-version")).toBe("2026-03-10");
});
