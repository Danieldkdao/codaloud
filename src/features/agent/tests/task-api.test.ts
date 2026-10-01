import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  trigger: vi.fn(),
  retrieve: vi.fn(),
  complete: vi.fn(),
  subscribe: vi.fn(),
  key: vi.fn(),
  credits: vi.fn(),
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
vi.mock("@/features/billing/server/billing-service", () => ({
  requireAvailableCredits: mocks.credits,
  InsufficientCreditsError: class extends Error {},
}));
import { InsufficientCreditsError } from "@/features/billing/server/billing-service";
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
  mocks.credits.mockResolvedValue({ tier: "free", monthlyCredits: 50 });
});
it("blocks new tasks when credits run out", async () => {
  mocks.credits.mockRejectedValue(new InsufficientCreditsError());
  expect(
    (
      await handleAgentRequest(
        request("POST", {
          requestId: "00000000-0000-4000-8000-000000000001",
          projectId: "00000000-0000-4000-8000-000000000002",
          deviceId: "00000000-0000-4000-8000-000000000003",
          revision: "a".repeat(64),
          instruction: "Read files",
        }),
      )
    ).status,
  ).toBe(402);
  expect(mocks.trigger).not.toHaveBeenCalled();
});
it("labels a background credit failure as a billing action in task results", async () => {
  mocks.retrieve.mockResolvedValue({ payload: { userId: "owner" } });
  mocks.subscribe.mockReturnValue({
    unsubscribe: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield { status: "FAILED", metadata: { billingError: true, logs: [] } };
    },
  });
  const response = await handleAgentRequest(request("GET"));
  const event = JSON.parse((await response.text()).trim());
  expect(event.summary).toMatch(/credits.*(upgrade|add)/i);
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
    {
      ...input,
      title: "Workspace task",
      userId: "owner",
      agentModel: "deepseek/deepseek-v4.1-flash",
    },
    expect.objectContaining({
      idempotencyKey: "stable-key",
      maxAttempts: 1,
      concurrencyKey: `owner:${input.deviceId}:${input.projectId}`,
    }),
  );
});

it("honors a paid user's selected agent model and resets free users to default", async () => {
  const input = {
    requestId: "00000000-0000-4000-8000-000000000004",
    projectId: "00000000-0000-4000-8000-000000000002",
    deviceId: "00000000-0000-4000-8000-000000000003",
    revision: "a".repeat(64),
    instruction: "Read files",
    agentModel: "anthropic/claude-sonnet-4.5",
  };
  mocks.key.mockResolvedValue("key");
  mocks.trigger.mockResolvedValue({ id: "run_created" });
  mocks.credits.mockResolvedValue({ tier: "tier_1", monthlyCredits: 100 });
  expect((await handleAgentRequest(request("POST", input))).status).toBe(202);
  expect(mocks.trigger.mock.calls[0][1].agentModel).toBe(input.agentModel);
  mocks.credits.mockResolvedValue({ tier: "free", monthlyCredits: 50 });
  expect(
    (
      await handleAgentRequest(
        request("POST", {
          ...input,
          requestId: "00000000-0000-4000-8000-000000000005",
        }),
      )
    ).status,
  ).toBe(202);
  expect(mocks.trigger.mock.calls[1][1].agentModel).toBe(
    "deepseek/deepseek-v4.1-flash",
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
it("streams queued handshakes and live action updates before completion", async () => {
  mocks.retrieve.mockResolvedValue({ payload: { userId: "owner" } });
  const command = {
    id: "begin",
    name: "beginTask",
    args: {},
    tokenId: "token",
    revision: "a".repeat(64),
  };
  const unsubscribe = vi.fn();
  let advance: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    advance = resolve;
  });
  mocks.subscribe.mockReturnValue({
    unsubscribe,
    async *[Symbol.asyncIterator]() {
      yield {
        status: "EXECUTING",
        metadata: { command, logs: ["Waiting for workspace"] },
      };
      await next;
      yield {
        status: "EXECUTING",
        metadata: {
          command: { ...command, name: "createFile" },
          logs: ["Running: Create file"],
        },
      };
      yield {
        status: "COMPLETED",
        metadata: { logs: ["Completed Create file"] },
        output: { summary: "Created." },
      };
    },
  });
  const response = await handleAgentRequest(request("GET"));
  const reader = response.body!.getReader();
  const decode = (value: Uint8Array | undefined) =>
    JSON.parse(new TextDecoder().decode(value));
  expect(decode((await reader.read()).value)).toMatchObject({
    status: "queued",
    logs: ["Waiting for workspace"],
  });
  advance();
  expect(decode((await reader.read()).value)).toMatchObject({
    status: "waiting",
    logs: ["Running: Create file"],
  });
  expect(decode((await reader.read()).value)).toMatchObject({
    status: "completed",
    summary: "Created.",
  });
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
});
