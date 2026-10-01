import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  read: vi.fn(),
  enqueue: vi.fn(),
  online: true,
  focused: true,
  onlineChanged: undefined as (() => void) | undefined,
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItemSync: (key: string) => mocks.storage.get(key) ?? null,
    setItemSync: (key: string, value: string) => mocks.storage.set(key, value),
  },
}));
vi.mock("@/features/projects/local/access", () => ({
  getLocalProjects: async () => ({ read: mocks.read }),
}));
vi.mock("../actions/terminal-client", () => ({
  getTerminalDeviceId: async () => "00000000-0000-4000-8000-000000000002",
  terminalApi: { deleteSandbox: mocks.enqueue },
}));
vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => mocks.online,
    subscribe: (callback: () => void) => {
      mocks.onlineChanged = callback;
      return () => {
        mocks.onlineChanged = undefined;
      };
    },
  },
  focusManager: { isFocused: () => mocks.focused, subscribe: () => () => {} },
}));
import {
  prepareProjectSandboxCleanup,
  cancelProjectSandboxCleanup,
  drainProjectSandboxCleanup,
  subscribeProjectSandboxCleanup,
} from "../actions/sandbox-cleanup";

const projectId = "00000000-0000-4000-8000-000000000001";
let unsubscribe: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.storage.clear();
  mocks.read.mockReset();
  mocks.enqueue.mockReset();
  mocks.online = true;
  mocks.focused = true;
  mocks.enqueue.mockResolvedValue(undefined);
  unsubscribe = subscribeProjectSandboxCleanup("user");
});
afterEach(async () => {
  unsubscribe();
  await drainProjectSandboxCleanup().catch(() => undefined);
  vi.useRealTimers();
});

it("persists cleanup offline and sends it after reconnecting", async () => {
  mocks.online = false;
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(Array.from(mocks.storage.values()).join()).toContain("sandbox");
  mocks.online = true;
  mocks.onlineChanged?.();
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledWith(
    projectId,
    "00000000-0000-4000-8000-000000000002",
    "sandbox",
  );
  expect(Array.from(mocks.storage.values()).join()).not.toContain("sandbox");
});

it("does not delete a sandbox while the local project still exists", async () => {
  mocks.read.mockReturnValue({ id: projectId });
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  mocks.read.mockReturnValue(null);
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledOnce();
});

it("retains the request across failure and an app restart", async () => {
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  mocks.enqueue.mockRejectedValueOnce(new Error("Offline"));
  await drainProjectSandboxCleanup();
  expect(Array.from(mocks.storage.values()).join()).toContain("sandbox");
  unsubscribe();
  unsubscribe = subscribeProjectSandboxCleanup("user");
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  expect(Array.from(mocks.storage.values()).join()).not.toContain("sandbox");
});

it("keeps cleanup for the original account after switching users", async () => {
  mocks.online = false;
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  unsubscribe();
  unsubscribe = subscribeProjectSandboxCleanup("another-user");
  mocks.online = true;
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  unsubscribe();
  unsubscribe = subscribeProjectSandboxCleanup("user");
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledOnce();
});

it("cancels cleanup after a local deletion failure", async () => {
  const key = await prepareProjectSandboxCleanup(projectId, "sandbox");
  cancelProjectSandboxCleanup(key);
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("shares a pending handoff between concurrent drains", async () => {
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  let finish!: () => void;
  mocks.enqueue.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const first = drainProjectSandboxCleanup();
  const second = drainProjectSandboxCleanup();
  await vi.waitFor(() => expect(mocks.enqueue).toHaveBeenCalledOnce());
  finish();
  await Promise.all([first, second]);
  expect(mocks.enqueue).toHaveBeenCalledOnce();
});

it("preserves another cleanup queued while a request is pending", async () => {
  await prepareProjectSandboxCleanup(projectId, "first-sandbox");
  let finish!: () => void;
  mocks.enqueue.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = drainProjectSandboxCleanup();
  await vi.waitFor(() => expect(mocks.enqueue).toHaveBeenCalledOnce());
  await prepareProjectSandboxCleanup(
    "00000000-0000-4000-8000-000000000003",
    "second-sandbox",
  );
  finish();
  await pending;
  expect(Array.from(mocks.storage.values()).join()).toContain("second-sandbox");
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  expect(Array.from(mocks.storage.values()).join()).not.toContain(
    "second-sandbox",
  );
});

it("retries a failed handoff without another user action", async () => {
  await prepareProjectSandboxCleanup(projectId, "sandbox");
  mocks.enqueue.mockRejectedValueOnce(new Error("Server restarting"));
  await drainProjectSandboxCleanup();
  await vi.advanceTimersByTimeAsync(30_000);
  await drainProjectSandboxCleanup();
  expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  expect(Array.from(mocks.storage.values()).join()).not.toContain("sandbox");
});
