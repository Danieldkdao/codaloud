import { expect, it, vi } from "vitest";
import { createDeviceExecutor } from "../device-executor";
const revision = "a".repeat(64);
const command = {
  id: "call-1",
  name: "gitCommit",
  args: { message: "fix", paths: ["a.ts"] },
  revision,
  tokenId: "token-1",
};
it("records a result before acknowledgement and reuses it on reconnect", async () => {
  const receipts = new Map<string, string>();
  const execute = vi
    .fn()
    .mockResolvedValue({ ok: true, text: "committed", revision });
  const deps = {
    read: async (key: string) => receipts.get(key) ?? null,
    write: async (key: string, value: string) => {
      receipts.set(key, value);
    },
    execute,
  };
  const first = createDeviceExecutor(deps);
  const results = await Promise.all([
    first("run-1", command),
    first("run-1", command),
  ]);
  expect(results[0]).toEqual(results[1]);
  const reconnect = createDeviceExecutor(deps);
  expect(await reconnect("run-1", command)).toMatchObject({ ok: true });
  expect(execute).toHaveBeenCalledOnce();
});
it("does not replay an operation interrupted between execution and receipt persistence", async () => {
  const execute = vi.fn();
  const run = createDeviceExecutor({
    read: async () => JSON.stringify({ state: "started" }),
    write: vi.fn(),
    execute,
  });
  expect(await run("run-1", command)).toMatchObject({
    ok: false,
    text: expect.stringContaining("unknown"),
  });
  expect(execute).not.toHaveBeenCalled();
});
it("does not execute if the durable started marker cannot be saved", async () => {
  const execute = vi.fn();
  const run = createDeviceExecutor({
    read: async () => null,
    write: async () => {
      throw new Error("disk full");
    },
    execute,
  });
  await expect(run("run-1", command)).rejects.toThrow("disk full");
  expect(execute).not.toHaveBeenCalled();
});
