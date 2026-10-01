import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((options) => options),
  AbortTaskRunError: class extends Error {},
}));
vi.mock("../server/sandbox", () => ({
  deleteProjectSandbox: mocks.remove,
  SandboxOwnershipError: class extends Error {},
}));
import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { SandboxOwnershipError } from "../server/sandbox";
import "@/trigger/delete-project-sandbox";

const run = vi.mocked(task).mock.calls[0][0].run;
const payload = {
  userId: "user",
  deviceId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000001",
  sandboxId: "sandbox",
};
beforeEach(() => {
  mocks.remove.mockReset();
});

it("checks sandbox ownership again inside the background job", async () => {
  mocks.remove.mockResolvedValue(undefined);
  await expect(run(payload, {} as never)).resolves.toEqual({ deleted: true });
  expect(mocks.remove).toHaveBeenCalledWith("sandbox", payload);
});

it("aborts permanently when sandbox ownership has changed", async () => {
  mocks.remove.mockRejectedValue(
    new SandboxOwnershipError("Ownership changed"),
  );
  await expect(run(payload, {} as never)).rejects.toBeInstanceOf(
    AbortTaskRunError,
  );
});

it("propagates transient deletion failures so Trigger can retry", async () => {
  const outage = new Error("Daytona unavailable");
  mocks.remove.mockRejectedValue(outage);
  await expect(run(payload, {} as never)).rejects.toBe(outage);
});
