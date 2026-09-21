import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
  migrate: vi.fn(),
  execute: vi.fn(),
  archives: vi.fn(),
}));
vi.mock("@/db/local/db", () => ({
  db: { select: () => ({ from: () => ({ all: mocks.rows }) }) },
}));
vi.mock("@/db/local/migrate", () => ({ migrateDatabase: mocks.migrate }));
vi.mock("../local/projects", () => ({ localProjectStore: {} }));
vi.mock("@/services/local-workspace/execute", () => ({
  executeWorkspace: mocks.execute,
  listArchivedWorkspaceIds: mocks.archives,
}));
const surviving = "00000000-0000-4000-8000-000000000001";
const deleted = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.rows.mockReturnValue([{ id: surviving }]);
  mocks.archives.mockResolvedValue([surviving, deleted]);
  mocks.execute.mockResolvedValue(true);
});

it("restores surviving projects and purges orphan archives before admitting project actions", async () => {
  const { getLocalProjects } = await import("../local/access");
  await Promise.all([getLocalProjects(), getLocalProjects()]);
  expect(mocks.execute.mock.calls).toEqual([
    [surviving, "restore-project"],
    [deleted, "purge-project"],
  ]);
  expect(mocks.archives).toHaveBeenCalledOnce();
});

it("retries a failed orphan purge after restarting without blocking surviving projects", async () => {
  mocks.execute.mockImplementation(async (_id, operation) => {
    if (operation === "purge-project") throw new Error("busy");
    return true;
  });
  await (await import("../local/access")).getLocalProjects();
  vi.resetModules();
  mocks.execute.mockResolvedValue(true);
  await (await import("../local/access")).getLocalProjects();
  expect(
    mocks.execute.mock.calls.filter((call) => call[1] === "purge-project"),
  ).toEqual([
    [deleted, "purge-project"],
    [deleted, "purge-project"],
  ]);
});

it("retries failed archive discovery before admitting actions", async () => {
  mocks.archives.mockRejectedValueOnce(new Error("unavailable"));
  const { getLocalProjects } = await import("../local/access");
  await expect(getLocalProjects()).rejects.toThrow("unavailable");
  await getLocalProjects();
  expect(mocks.execute).toHaveBeenCalledWith(deleted, "purge-project");
});
