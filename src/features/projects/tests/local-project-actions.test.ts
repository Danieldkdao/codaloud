import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  list: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  execute: vi.fn(),
  token: vi.fn(),
  repository: vi.fn(),
  getSandboxId: vi.fn(),
  prepareCleanup: vi.fn(),
  cancelCleanup: vi.fn(),
  drainCleanup: vi.fn(),
}));
vi.mock("@/features/terminal/actions/sandbox-cleanup", () => ({
  prepareProjectSandboxCleanup: mocks.prepareCleanup,
  cancelProjectSandboxCleanup: mocks.cancelCleanup,
  drainProjectSandboxCleanup: mocks.drainCleanup,
}));
vi.mock("../local/access", () => ({ getLocalProjects: async () => mocks }));
vi.mock("@/services/local-workspace/execute", () => ({
  executeWorkspace: mocks.execute,
  LocalWorkspaceError: class extends Error {},
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@/services/github/credentials", () => ({
  getGitHubAccessToken: mocks.token,
}));
vi.mock("@/services/github/server/repositories", () => ({
  verifyGitHubRepositoryAccess: mocks.repository,
}));
import {
  createProjectAction,
  deleteProjectAction,
  readProjectAction,
  readProjectsAction,
  updateProjectAction,
} from "../actions/actions";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockResolvedValue(true);
  mocks.getSandboxId.mockReturnValue(null);
  mocks.prepareCleanup.mockResolvedValue("cleanup-key");
  mocks.drainCleanup.mockResolvedValue(undefined);
});

it("persists sandbox cleanup before removing local metadata and does not wait for the remote job", async () => {
  mocks.read.mockReturnValue({ id });
  mocks.remove.mockReturnValue({ id });
  mocks.getSandboxId.mockReturnValue("sandbox");
  let finish!: () => void;
  mocks.drainCleanup.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  expect(await deleteProjectAction(id)).toMatchObject({ error: false });
  expect(mocks.prepareCleanup).toHaveBeenCalledWith(id, "sandbox");
  expect(mocks.prepareCleanup.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.remove.mock.invocationCallOrder[0],
  );
  expect(mocks.drainCleanup).toHaveBeenCalledOnce();
  finish();
});

it("cancels prepared sandbox cleanup when native project deletion rolls back", async () => {
  mocks.read.mockReturnValue({ id });
  mocks.getSandboxId.mockReturnValue("sandbox");
  mocks.remove.mockImplementation(() => {
    throw new Error("database locked");
  });
  expect(await deleteProjectAction(id)).toMatchObject({ error: true });
  expect(mocks.cancelCleanup).toHaveBeenCalledWith("cleanup-key");
  expect(mocks.drainCleanup).not.toHaveBeenCalled();
});

it("keeps the project when cleanup cannot be persisted", async () => {
  mocks.read.mockReturnValue({ id });
  mocks.getSandboxId.mockReturnValue("sandbox");
  mocks.prepareCleanup.mockRejectedValue(new Error("Storage full"));
  expect(await deleteProjectAction(id)).toMatchObject({
    error: true,
    message: "Storage full",
  });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("creates a ready local project without credentials or network", async () => {
  expect(
    await createProjectAction({ source: "new", name: "Offline" }),
  ).toMatchObject({ error: false, projectId: id });
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("sandboxId");
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("userId");
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.execute).toHaveBeenCalledWith(id, "initialize");
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ setupStatus: "ready" }),
  );
});
it("does not insert metadata when native creation fails", async () => {
  mocks.execute.mockRejectedValue(new Error("Storage full"));
  expect(
    await createProjectAction({ source: "new", name: "Offline" }),
  ).toMatchObject({ error: true });
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("requires optional credentials only for GitHub imports", async () => {
  mocks.token.mockRejectedValue(new Error("Connect GitHub"));
  expect(
    await createProjectAction({
      source: "github",
      name: "Remote",
      repositoryId: "42",
    }),
  ).toMatchObject({ error: true });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("restores files if deleting SQLite metadata fails", async () => {
  mocks.read.mockReturnValue({ id });
  mocks.remove.mockImplementation(() => {
    throw new Error("database locked");
  });
  expect(await deleteProjectAction(id)).toMatchObject({ error: true });
  expect(mocks.execute.mock.calls.map((call) => call[1])).toEqual([
    "archive-project",
    "restore-project",
  ]);
});
it("returns successful deletion even when archive cleanup must be retried", async () => {
  mocks.read.mockReturnValue({ id });
  mocks.remove.mockReturnValue({ id });
  mocks.execute.mockImplementation(async (_id, operation) => {
    if (operation === "purge-project") throw new Error("busy");
    return true;
  });
  expect(await deleteProjectAction(id)).toMatchObject({ error: false });
});
it("reads empty local collections and returns null on storage errors", async () => {
  mocks.list.mockReturnValue({ projects: [], nextCursor: null });
  expect(await readProjectsAction()).toEqual({
    projects: [],
    nextCursor: null,
  });
  mocks.read.mockImplementation(() => {
    throw new Error("unavailable");
  });
  expect(await readProjectAction(id)).toBeNull();
});

it("rejects invalid identifiers before storage access", async () => {
  expect(await readProjectAction("../project")).toBeNull();
  expect(await deleteProjectAction("bad")).toMatchObject({ error: true });
  expect(mocks.read).not.toHaveBeenCalled();
});
it("renames only the local project by ID", async () => {
  mocks.update.mockReturnValue({ id });
  expect(await updateProjectAction(id, { name: "Renamed" })).toMatchObject({
    error: false,
  });
  expect(mocks.update).toHaveBeenCalledWith(id, { name: "Renamed" });
});
it("clones the verified repository URL with ephemeral credentials", async () => {
  mocks.token.mockResolvedValue("ephemeral-token");
  mocks.repository.mockResolvedValue({
    cloneUrl: "https://github.com/example/repo.git",
  });
  expect(
    await createProjectAction({
      source: "github",
      name: "Repo",
      repositoryId: "42",
    }),
  ).toMatchObject({ error: false });
  expect(mocks.execute).toHaveBeenCalledWith(id, "clone", {
    url: "https://github.com/example/repo.git",
    accessToken: "ephemeral-token",
  });
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("accessToken");
});
