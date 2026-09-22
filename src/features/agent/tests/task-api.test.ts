import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  trigger: vi.fn(),
  retrieve: vi.fn(),
  complete: vi.fn(),
  subscribe: vi.fn(),
  key: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("@/services/trigger/server", () => ({
  tasks: { trigger: mocks.trigger },
  runs: { retrieve: mocks.retrieve, subscribeToRun: mocks.subscribe },
  wait: { completeToken: mocks.complete },
  idempotencyKeys: { create: mocks.key },
}));
import { handleAgentRequest } from "../server/task-api";
const request = (method: string, body?: unknown, runId = "run_one") =>
  new Request(`https://test/api/agent/tasks?runId=${runId}`, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
});
it("rejects unauthenticated requests before touching Trigger", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await handleAgentRequest(request("GET"))).status).toBe(401);
  expect(mocks.retrieve).not.toHaveBeenCalled();
});
it("rejects another user's run before streaming or accepting device results", async () => {
  mocks.retrieve.mockResolvedValue({ payload: { userId: "someone-else" } });
  expect((await handleAgentRequest(request("GET"))).status).toBe(403);
  expect(
    (
      await handleAgentRequest(
        request("PATCH", {
          tokenId: "token",
          result: { ok: true, text: "done" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.subscribe).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("rejects a result for a token that is not the run's pending command", async () => {
  mocks.retrieve.mockResolvedValue({
    payload: { userId: "owner" },
    metadata: {
      command: {
        id: "step",
        name: "readFile",
        args: {},
        revision: "a".repeat(64),
        tokenId: "expected",
      },
    },
  });
  expect(
    (
      await handleAgentRequest(
        request("PATCH", {
          tokenId: "other",
          result: { ok: true, text: "done" },
        }),
      )
    ).status,
  ).toBe(409);
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("scopes submission identity and queue ownership to the authenticated user", async () => {
  const input = {
    requestId: "00000000-0000-4000-8000-000000000001",
    projectId: "00000000-0000-4000-8000-000000000002",
    deviceId: "00000000-0000-4000-8000-000000000003",
    revision: "a".repeat(64),
    instruction: "Read files",
  };
  mocks.key.mockResolvedValue("stable-key");
  mocks.trigger.mockResolvedValue({ id: "run_created" });
  expect((await handleAgentRequest(request("POST", input))).status).toBe(202);
  expect(mocks.key).toHaveBeenCalledWith(
    `owner:${input.deviceId}:${input.requestId}`,
    { scope: "global" },
  );
  expect(mocks.trigger).toHaveBeenCalledWith(
    "workspace-task",
    { ...input, userId: "owner" },
    expect.objectContaining({
      idempotencyKey: "stable-key",
      maxAttempts: 1,
      concurrencyKey: `owner:${input.deviceId}:${input.projectId}`,
    }),
  );
});

it("closes the response and unsubscribes immediately when the client aborts", async () => {
  mocks.retrieve.mockResolvedValue({ payload: { userId: "owner" } });
  const unsubscribe = vi.fn();
  mocks.subscribe.mockReturnValue({
    unsubscribe,
    async *[Symbol.asyncIterator]() {
      await new Promise(() => {});
    },
  });
  const controller = new AbortController();
  const response = await handleAgentRequest(
    new Request("https://test/api/agent/tasks?runId=run_one", {
      signal: controller.signal,
    }),
  );
  const reader = response.body!.getReader();
  controller.abort();
  expect(await reader.read()).toEqual({ done: true, value: undefined });
  expect(unsubscribe).toHaveBeenCalledOnce();
});
