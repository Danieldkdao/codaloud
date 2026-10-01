import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  revision: vi.fn(async () => "a".repeat(64)),
  execute: vi.fn(),
  flush: vi.fn(),
  ui: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/features/agent/tools/device-tools", () => ({
  executeDeviceTool: mocks.execute,
  readWorkspaceRevision: mocks.revision,
}));
vi.mock("@/features/agent/workspace-access", () => ({
  flushAgentWorkspace: mocks.flush,
  runAgentMutation: async (_project: string, action: () => Promise<unknown>) =>
    action(),
}));
vi.mock("@/features/projects/local/access", () => ({
  getLocalProjects: async () => ({ list: mocks.list }),
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  editorPreferencesStore: {
    load: async () => {},
    getSnapshot: () => ({ preferences: { aiDisabledPaths: "" } }),
  },
}));
import { inlineSession } from "../inline-session";
import { executeCommandAction } from "../command-actions";
import { commandCenter } from "../command-center";
import { registerCommandNavigation } from "../command-navigation";
beforeEach(() => {
  vi.clearAllMocks();
  inlineSession.cancel();
  commandCenter.clear();
  mocks.execute.mockResolvedValue({ ok: true, text: "[]", truncated: false });
});

it("rejects stale tool calls before navigation or workspace access", async () => {
  const release = registerCommandNavigation(mocks.ui);
  const request = await inlineSession.begin("p", "agent");
  inlineSession.cancel();
  await expect(
    executeCommandAction("p", {
      id: request.id,
      name: "navigate",
      args: { target: "files" },
    }),
  ).rejects.toThrow(/cancelled/);
  expect(mocks.ui).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  release();
});

it("opens panels without ending the active request", async () => {
  const release = registerCommandNavigation(mocks.ui);
  const request = await inlineSession.begin("p", "agent");
  await executeCommandAction("p", {
    id: request.id,
    name: "navigate",
    args: { target: "git" },
  });
  expect(mocks.ui).toHaveBeenCalledWith("p", { target: "git" });
  expect(inlineSession.getSnapshot()?.id).toBe(request.id);
  release();
});

it("rejects project discovery rather than exposing other resources", async () => {
  const request = await inlineSession.begin("p", "agent");
  await expect(
    executeCommandAction("p", {
      id: request.id,
      name: "listProjects",
      args: {},
    }),
  ).rejects.toThrow(/Unknown/);
  expect(mocks.list).not.toHaveBeenCalled();
});

it("shows structured file results in the bubble after executing a validated workspace tool", async () => {
  mocks.execute.mockResolvedValue({
    ok: true,
    text: JSON.stringify([{ path: "src/a.ts", isDir: false }]),
    truncated: false,
  });
  const request = await inlineSession.begin("p", "agent");
  await executeCommandAction("p", {
    id: request.id,
    name: "listFiles",
    args: { path: "src" },
  });
  expect(commandCenter.getSnapshot().result).toMatchObject({
    projectId: "p",
    kind: "files",
    entries: [{ path: "src/a.ts", isDir: false }],
  });
});

it("keeps draft actions limited to the open draft and never grants mutation tools to quick edits", async () => {
  const draft = await inlineSession.begin("draft:one", "agent");
  await expect(
    executeCommandAction("draft:one", {
      id: draft.id,
      name: "gitCommit",
      args: {},
    }),
  ).rejects.toThrow(/Draft/);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("deduplicates concurrent mutation calls and rejects reuse with different arguments", async () => {
  const request = await inlineSession.begin("p", "agent");
  const payload = {
    id: request.id,
    callId: "create-one",
    name: "createFile",
    args: { name: "one.ts", parentPath: "", kind: "file" },
  };
  await Promise.all([
    executeCommandAction("p", payload),
    executeCommandAction("p", payload),
  ]);
  expect(mocks.execute).toHaveBeenCalledOnce();
  await expect(
    executeCommandAction("p", {
      ...payload,
      args: { ...payload.args, name: "two.ts" },
    }),
  ).rejects.toThrow(/reused/);
  expect(mocks.execute).toHaveBeenCalledOnce();
});
it("does not repeat an uncertain failed action with the same call identity", async () => {
  const request = await inlineSession.begin("p", "agent");
  mocks.execute.mockRejectedValue(new Error("Connection lost after dispatch"));
  const payload = {
    id: request.id,
    callId: "uncertain",
    name: "createFile",
    args: { name: "one.ts", parentPath: "", kind: "file" },
  };
  await expect(executeCommandAction("p", payload)).rejects.toThrow(
    /Connection lost/,
  );
  await expect(executeCommandAction("p", payload)).rejects.toThrow(
    /Connection lost/,
  );
  expect(mocks.execute).toHaveBeenCalledOnce();
});
