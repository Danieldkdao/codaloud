import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), guard: vi.fn() }));
vi.mock("@/features/projects/actions/file-actions", () => ({
  saveProjectFileContentAction: mocks.save,
}));
vi.mock("@/features/projects/actions/git-actions", () => ({}));
vi.mock("@/features/projects/actions/publish-actions", () => ({}));
vi.mock("@/services/local-workspace/execute", () => ({
  executeWorkspace: vi.fn(),
  withWorkspaceRevision: mocks.guard,
}));
import { executeDeviceTool } from "../tools/device-tools";
beforeEach(() => {
  mocks.guard.mockImplementation(async (_id, _revision, action) => {
    const result = await action();
    throw new Error("Missing native revision");
  });
});
it("preserves an action's conflict message before checking its success revision", async () => {
  mocks.save.mockResolvedValue({
    error: true,
    message: "File changed since you read it.",
  });
  await expect(
    executeDeviceTool("project", {
      id: "step",
      tokenId: "token",
      name: "saveFile",
      revision: "a".repeat(64),
      args: {
        path: "readme.md",
        content: "New",
        expectedContentHash: "b".repeat(64),
      },
    }),
  ).rejects.toThrow("File changed since you read it.");
});
