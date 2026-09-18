import { beforeEach, expect, it, vi } from "vitest";
import { readGitHubRepositories, readGitHubRepositoryBranches } from "../actions/actions";

const mocks = vi.hoisted(() => ({ token: vi.fn(), repositories: vi.fn(), branches: vi.fn() }));
vi.mock("../credentials", () => ({ getGitHubAccessToken: mocks.token }));
vi.mock("../server/repositories", () => ({ listGitHubRepositoryPage: mocks.repositories, listGitHubRepositoryBranches: mocks.branches }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("device-token");
  mocks.repositories.mockResolvedValue({ repositories: [], nextCursor: null });
  mocks.branches.mockResolvedValue({ branches: [], nextCursor: null });
});

it("reads repository picker data using the device connection without a Codaloud session", async () => {
  const result = await readGitHubRepositories({ search: "example" });
  expect(result).toEqual({ repositories: [], nextCursor: null });
  expect(mocks.repositories).toHaveBeenCalledWith("device-token", undefined, expect.objectContaining({ search: "example" }));
});

it("reads branches with the current device credential and refuses invalid IDs before requesting it", async () => {
  expect(await readGitHubRepositoryBranches("42")).toEqual({ branches: [], nextCursor: null });
  expect(mocks.branches).toHaveBeenCalledWith("device-token", "42", undefined, expect.any(Object));
  mocks.token.mockClear();
  expect(await readGitHubRepositoryBranches("../other")).toBeNull();
  expect(mocks.token).not.toHaveBeenCalled();
});

it("returns null on disconnected, cancelled, and invalid read responses", async () => {
  mocks.token.mockRejectedValue(new Error("Connect GitHub first"));
  expect(await readGitHubRepositories()).toBeNull();
  mocks.token.mockResolvedValue("device-token");
  mocks.repositories.mockResolvedValue({ repositories: [{ id: "bad" }] });
  expect(await readGitHubRepositories()).toBeNull();
  const controller = new AbortController();
  controller.abort();
  mocks.token.mockClear();
  expect(await readGitHubRepositories({ signal: controller.signal })).toBeNull();
  expect(mocks.token).not.toHaveBeenCalled();
});
