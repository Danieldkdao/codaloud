import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  create: vi.fn(),
  execute: vi.fn(),
  complete: vi.fn(),
  subscribe: vi.fn(),
  uuid: 0,
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItem: async (key: string) => mocks.disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mocks.disk.set(key, value);
    },
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () =>
    `00000000-0000-4000-8000-${String(++mocks.uuid).padStart(12, "0")}`,
}));
vi.mock("../actions", () => ({
  createAgentTask: mocks.create,
  completeAgentCommand: mocks.complete,
  subscribeAgentTask: mocks.subscribe,
}));
vi.mock("../tools/device-tools", () => ({
  executeDeviceTool: mocks.execute,
  readWorkspaceRevision: async () => "a".repeat(64),
}));
vi.mock("../workspace-access", () => ({
  flushAgentWorkspace: async () => {},
}));
const projectId = "00000000-0000-4000-8000-000000000099";
let runtime: typeof import("../task-runtime").agentTasks;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.disk.clear();
  mocks.create.mockReset().mockResolvedValue({ id: "run_test" });
  mocks.complete.mockReset().mockResolvedValue(undefined);
  mocks.execute.mockReset().mockResolvedValue({ ok: true, text: "done" });
  mocks.subscribe.mockReset().mockImplementation(async function* () {});
  runtime = (await import("../task-runtime")).agentTasks;
  runtime.setSession("user-a", true);
});
it("does not show a reconnect warning for repeated snapshots of an acknowledged command", async () => {
  const event = {
    id: "run_test",
    status: "waiting",
    logs: ["Running: Check Git status"],
    command: {
      id: "status-one",
      name: "gitStatus",
      args: {},
      revision: "a".repeat(64),
      tokenId: "token-one",
    },
  };
  mocks.subscribe.mockImplementation(async function* () {
    yield event;
    yield { ...event, logs: [...event.logs, "Completed Check Git status"] };
    yield { ...event, status: "completed", command: null, summary: "Done" };
  });
  mocks.complete
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(
      new Error("Couldn’t connect to the task service. Reconnecting…"),
    );
  await runtime.enqueue(projectId, "Check status", "call-one");
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.getSnapshot()[0].connectionError).toBeUndefined();
  expect(runtime.getSnapshot()[0].event.status).toBe("completed");
  expect(mocks.complete).toHaveBeenCalledOnce();
  expect(mocks.execute).toHaveBeenCalledOnce();
});
afterEach(() => {
  runtime.setSession(null, false);
  vi.useRealTimers();
});
it("deduplicates concurrent deliveries of the same voice tool call", async () => {
  await Promise.all([
    runtime.enqueue(projectId, "Read files", "call-one"),
    runtime.enqueue(projectId, "Read files", "call-one"),
  ]);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot()).toHaveLength(1);
});
it("persists the task title and sends it with the accepted request", async () => {
  await runtime.enqueue(
    projectId,
    "Read every project file",
    "title-call",
    "Explore project",
  );
  expect(runtime.getSnapshot()[0].request.title).toBe("Explore project");
  expect(mocks.create.mock.calls[0][0].title).toBe("Explore project");
});
it("does not reconnect an old user's task after changing accounts", async () => {
  await runtime.enqueue(projectId, "Read private files", "call-one");
  await vi.advanceTimersByTimeAsync(1);
  runtime.setSession("user-b", true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(runtime.getSnapshot()).toHaveLength(0);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("never reports an unconfirmed POST as accepted on redelivery", async () => {
  mocks.create.mockRejectedValue(new Error("offline"));
  await expect(
    runtime.enqueue(projectId, "Commit", "call-one"),
  ).rejects.toThrow();
  expect(await runtime.enqueue(projectId, "Commit", "call-one")).toMatchObject({
    accepted: false,
  });
});
