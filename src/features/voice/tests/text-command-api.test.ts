import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  generate: vi.fn(),
  charge: vi.fn(),
  credits: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: mocks.generate,
}));
vi.mock("@/services/ai/server", () => ({
  meteredChatModel: () => "test-model",
}));
vi.mock("@/features/billing/server/billing-service", () => ({
  chargeCredits: mocks.charge,
  requireAvailableCredits: mocks.credits,
  InsufficientCreditsError: class extends Error {},
}));
import { handleTextCommand } from "../server/text-command-api";
const context = {
  id: "turn",
  projectId: "p",
  branch: "main",
  mode: "agent",
  openFiles: [],
  openFilesTruncated: false,
  activeFile: null,
};
const request = (body: unknown) =>
  new Request("https://api.test/api/voice/text", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ userId: "user" });
  mocks.credits.mockResolvedValue({ tier: "free" });
  mocks.generate.mockResolvedValue({
    text: "Done",
    toolCalls: [],
    responseMessages: [{ role: "assistant", content: "Done" }],
    usage: { inputTokens: 10, outputTokens: 10 },
    finalStep: { providerMetadata: {} },
    finishReason: "stop",
  });
});
it("requires authentication and validates request size before inference", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await handleTextCommand(request({}))).status).toBe(401);
  expect(mocks.generate).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ userId: "user" });
  expect(
    (
      await handleTextCommand(
        request({
          context,
          messages: [{ role: "user", content: "x".repeat(200000) }],
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("returns bounded tool calls without executing client tools or starting a voice session", async () => {
  mocks.generate.mockResolvedValueOnce({
    text: "",
    toolCalls: [
      { toolName: "navigate", toolCallId: "call", input: { target: "files" } },
    ],
    responseMessages: [],
    usage: {},
    finalStep: { providerMetadata: {} },
    finishReason: "tool-calls",
  });
  const response = await handleTextCommand(
    request({
      context,
      requestId: "00000000-0000-4000-8000-000000000001",
      messages: [{ role: "user", content: "Open files" }],
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    toolCalls: [{ toolName: "navigate" }],
  });
  const options = mocks.generate.mock.calls[0][0];
  expect(options.tools.navigate.execute).toBeUndefined();
  expect(options.tools.runTerminalCommand.execute).toBeUndefined();
  expect(mocks.charge).toHaveBeenCalledOnce();
});
it("forces a final answer when the client reaches its tool step budget", async () => {
  const response = await handleTextCommand(
    request({
      context,
      requestId: "00000000-0000-4000-8000-000000000001",
      final: true,
      messages: [{ role: "user", content: "List files" }],
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.generate.mock.calls[0][0].toolChoice).toBe("none");
});
