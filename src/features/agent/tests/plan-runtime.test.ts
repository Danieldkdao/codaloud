import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  write: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItem: async (key: string) => mocks.disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      await mocks.write();
      mocks.disk.set(key, value);
    },
  },
}));
vi.mock("../task-runtime", () => ({ agentTasks: { enqueue: mocks.enqueue } }));
let plans: typeof import("../plan-runtime").agentPlans;
const projectId = "00000000-0000-4000-8000-000000000099";
const propose = () =>
  plans.propose(
    projectId,
    "## Changes\n- Create `greeting.ts`",
    "room:turn",
    "Create greeting",
  );

beforeEach(async () => {
  vi.resetModules();
  mocks.disk.clear();
  mocks.write.mockReset().mockResolvedValue(undefined);
  mocks.enqueue.mockReset().mockResolvedValue({ id: "run", accepted: true });
  plans = (await import("../plan-runtime")).agentPlans;
  plans.setSession("user-a", true);
});

it("persists a deduplicated plan without starting work and restores it after restart", async () => {
  await propose();
  await propose();
  expect(plans.getSnapshot()).toHaveLength(1);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  plans.setSession(null, false);
  plans.setSession("user-a", true);
  await propose();
  expect(plans.getSnapshot()[0].instruction).toContain("greeting.ts");
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("approves once with the reviewed plan and corrections on the original project", async () => {
  await propose();
  await Promise.all([
    plans.approve("room:turn", "Use greeter.ts instead"),
    plans.approve("room:turn", "Duplicate tap"),
  ]);
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.enqueue).toHaveBeenCalledWith(
    projectId,
    expect.stringContaining("Use greeter.ts instead"),
    "room:turn",
    "Create greeting",
  );
  expect(mocks.enqueue.mock.calls[0][1]).toContain(
    "## Changes\n- Create `greeting.ts`",
  );
  expect(plans.getSnapshot()).toHaveLength(0);
  await propose();
  expect(plans.getSnapshot()).toHaveLength(0);
});

it("keeps an uncertain submission retryable with identical instructions and identity", async () => {
  await propose();
  mocks.enqueue.mockRejectedValueOnce(new Error("Connection lost"));
  await expect(plans.approve("room:turn", "Use greeter.ts")).rejects.toThrow(
    "Connection lost",
  );
  expect(plans.getSnapshot()).toHaveLength(1);
  await plans.approve("room:turn", "Changed after submission");
  expect(mocks.enqueue.mock.calls[1]).toEqual(mocks.enqueue.mock.calls[0]);
});

it("retains corrections and never submits on dismissal or account changes", async () => {
  await propose();
  await plans.updateDetails("room:turn", "Exact spelling");
  plans.setSession("user-b", true);
  await expect(plans.approve("room:turn", "")).rejects.toThrow();
  expect(plans.getSnapshot()).toEqual([]);
  plans.setSession("user-a", true);
  await propose();
  expect(plans.getSnapshot()[0].details).toBe("Exact spelling");
  await plans.discard("room:turn");
  await propose();
  expect(plans.getSnapshot()).toEqual([]);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("requires durable approval before dispatch and preserves a plan on disk failure", async () => {
  await propose();
  mocks.write.mockRejectedValueOnce(new Error("Disk full"));
  await expect(plans.approve("room:turn", "Correction")).rejects.toThrow(
    "Disk full",
  );
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(plans.getSnapshot()[0].submissionInstruction).toBeUndefined();
});

it("rejects new approvals while backgrounded and oversized combined instructions", async () => {
  await propose();
  plans.setSession("user-a", false);
  await expect(plans.approve("room:turn", "")).rejects.toThrow();
  plans.setSession("user-a", true);
  await expect(plans.approve("room:turn", "x".repeat(4000))).rejects.toThrow();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
