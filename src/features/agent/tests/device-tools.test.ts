import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
  guard: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/features/projects/actions/file-actions", () => ({
  saveProjectFileContentAction: mocks.save,
  readProjectFileContentAction: mocks.read,
  readProjectFilesAction: mocks.list,
}));
vi.mock("@/features/projects/actions/git-actions", () => ({}));
vi.mock("@/features/projects/actions/publish-actions", () => ({}));
vi.mock("../../../../modules/local-workspace", () => ({
  default: { execute: vi.fn() },
}));
vi.mock("@/services/local-workspace/execute", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  executeWorkspace: vi.fn(),
  withWorkspaceRevision: mocks.guard,
}));
import { executeDeviceTool } from "../tools/device-tools";
import { createDeviceExecutor } from "../device-executor";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ content: "Old", path: "readme.md", size: 3 });
  mocks.guard.mockImplementation(async (_id, _revision, action) => {
    const result = await action();
    throw new Error("Missing native revision");
  });
});
it("preserves a missing-folder result through execution and durable receipt replay", async () => {
  mocks.list.mockImplementation(
    async (_project, _input, _signal, _restoring, onFailure) => {
      onFailure?.(
        500,
        null,
        "DIRECTORY_NOT_FOUND",
        "This folder does not exist.",
      );
      return null;
    },
  );
  const receipts = new Map<string, string>();
  const dependencies = {
    read: async (key: string) => receipts.get(key) ?? null,
    write: async (key: string, value: string) => {
      receipts.set(key, value);
    },
    execute: (_run: string, command: Parameters<typeof executeDeviceTool>[1]) =>
      executeDeviceTool("project", command),
  };
  const command = {
    id: "list",
    tokenId: "token",
    name: "listFiles",
    args: { path: "tests" },
    revision: "a".repeat(64),
  };
  for (let delivery = 0; delivery < 2; delivery++) {
    const executor = createDeviceExecutor(dependencies);
    expect(await executor("run", command)).toMatchObject({
      ok: false,
      code: "DIRECTORY_NOT_FOUND",
      text: "This folder does not exist.",
    });
  }
  expect(mocks.list).toHaveBeenCalledOnce();
});
it("edits one exact excerpt while preserving the rest of a large file", async () => {
  const content = "before\n" + "unchanged\n".repeat(1500) + "after\n";
  mocks.read.mockResolvedValue({ content });
  mocks.save.mockResolvedValue({ error: false, data: { path: "file.ts" } });
  mocks.guard.mockImplementation(async (_id, revision, action) => ({
    result: await action(),
    revision,
  }));
  await executeDeviceTool("project", {
    id: "edit",
    tokenId: "token",
    name: "editFile",
    revision: "a".repeat(64),
    args: {
      path: "file.ts",
      oldText: "before\n",
      newText: "new\n",
      expectedContentHash: "b".repeat(64),
    },
  });
  expect(mocks.save).toHaveBeenCalledWith("project", {
    path: "file.ts",
    content: "new\n" + content.slice(7),
    expectedContentHash: "b".repeat(64),
  });
});
it("rejects ambiguous replacements without saving", async () => {
  mocks.read.mockResolvedValue({ content: "same same" });
  await expect(
    executeDeviceTool("project", {
      id: "edit",
      tokenId: "token",
      name: "editFile",
      revision: "a".repeat(64),
      args: {
        path: "file.ts",
        oldText: "same",
        newText: "new",
        expectedContentHash: "b".repeat(64),
      },
    }),
  ).rejects.toThrow("unique");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects whole-file replacement of a file larger than the excerpt budget", async () => {
  mocks.read.mockResolvedValue({ content: "x".repeat(8001) });
  await expect(
    executeDeviceTool("project", {
      id: "edit",
      tokenId: "token",
      name: "saveFile",
      revision: "a".repeat(64),
      args: {
        path: "file.ts",
        content: "small excerpt",
        expectedContentHash: "b".repeat(64),
      },
    }),
  ).rejects.toThrow("editFile");
  expect(mocks.save).not.toHaveBeenCalled();
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
it("reports changed paths only from a successful native edit result", async () => {
  mocks.save.mockResolvedValue({ error: false, data: { path: "actual.ts" } });
  mocks.guard.mockImplementation(async (_id, revision, action) => ({
    result: await action(),
    revision,
  }));
  const command = {
    id: "save",
    tokenId: "token",
    name: "saveFile",
    revision: "a".repeat(64),
    args: {
      path: "requested.ts",
      content: "new",
      expectedContentHash: "b".repeat(64),
    },
  };
  expect(await executeDeviceTool("project", command)).toMatchObject({
    changedFiles: ["actual.ts"],
  });
  mocks.save.mockResolvedValue({ error: true, message: "No write" });
  await expect(executeDeviceTool("project", command)).rejects.toThrow(
    "No write",
  );
});
