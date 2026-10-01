import { beforeEach, expect, it, vi } from "vitest";
import { handleExplanationRequest } from "../server/explanation-api";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  stream: vi.fn(),
  credits: vi.fn(),
  charge: vi.fn(),
}));
vi.mock("@/features/billing/server/billing-service", () => ({
  requireAvailableCredits: mocks.credits,
  chargeCredits: mocks.charge,
  InsufficientCreditsError: class extends Error {},
}));
import { InsufficientCreditsError } from "@/features/billing/server/billing-service";
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("ai", () => ({ streamText: mocks.stream }));
vi.mock("@/services/ai/server", () => ({
  meteredChatModel: (id: string) => id,
}));
const request = (body: unknown) =>
  new Request("https://test/api/editor/explain", {
    method: "POST",
    body: JSON.stringify(body),
  });
const input = { path: "a.ts", selected: "return 1;", before: "", after: "" };
const parts = async function* (...values: unknown[]) {
  yield* values;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "u" } });
  mocks.credits.mockResolvedValue({ monthlyCredits: 50 });
  mocks.charge.mockResolvedValue({ monthlyCredits: 48 });
  mocks.stream.mockReturnValue({
    usage: Promise.resolve({ inputTokens: 10_000, outputTokens: 1_000 }),
    finalStep: Promise.resolve({ providerMetadata: undefined }),
    stream: parts(
      { type: "text-delta", text: "**Returns** one." },
      { type: "finish", finishReason: "stop" },
    ),
  });
});
it("rejects an explanation without credits before opening the model stream", async () => {
  mocks.credits.mockRejectedValue(new InsufficientCreditsError());
  expect((await handleExplanationRequest(request(input))).status).toBe(402);
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("authenticates before generating", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await handleExplanationRequest(request(input))).status).toBe(401);
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("rejects empty and oversized selections", async () => {
  for (const selected of [" ", "x".repeat(24001)])
    expect(
      (await handleExplanationRequest(request({ ...input, selected }))).status,
    ).toBe(400);
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("streams Markdown with an explicit completion event using the requested model", async () => {
  const response = await handleExplanationRequest(request(input));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(
    (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual([{ type: "delta", text: "**Returns** one." }, { type: "done" }]);
  expect(mocks.stream.mock.calls[0][0]).toMatchObject({
    model: "openai/gpt-5.4-mini",
    maxRetries: 0,
  });
  expect(mocks.stream.mock.calls[0][0].tools).toBeUndefined();
  expect(mocks.charge).toHaveBeenCalledWith(
    "u",
    expect.stringMatching(/^explanation:/),
    2,
    "Code explanation",
  );
});
it("uses OpenRouter's reported cost when its chosen provider costs more than the model estimate", async () => {
  mocks.stream.mockReturnValue({
    usage: Promise.resolve({ inputTokens: 10_000, outputTokens: 1_000 }),
    finalStep: Promise.resolve({
      providerMetadata: { openrouter: { usage: { cost: 0.025 } } },
    }),
    stream: parts(
      { type: "text-delta", text: "Done." },
      { type: "finish", finishReason: "stop" },
    ),
  });
  const response = await handleExplanationRequest(request(input));
  expect(await response.text()).toContain('"type":"done"');
  expect(mocks.charge).toHaveBeenCalledWith(
    "u",
    expect.stringMatching(/^explanation:/),
    4,
    "Code explanation",
  );
});
it("reports an exhausted-credit error that occurs after explanation generation", async () => {
  mocks.charge.mockRejectedValueOnce(new InsufficientCreditsError());
  const response = await handleExplanationRequest(request(input));
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({
    type: "error",
    message: expect.stringMatching(/credits.*(upgrade|add)/i),
  });
});
it("reports provider failure without leaking internal errors", async () => {
  mocks.stream.mockReturnValue({
    stream: parts({ type: "error", error: "secret provider detail" }),
  });
  const text = await (await handleExplanationRequest(request(input))).text();
  expect(text).toContain('"type":"error"');
  expect(text).not.toContain("secret provider detail");
  expect(text).not.toContain('"done"');
  expect(mocks.charge).not.toHaveBeenCalled();
});
it("aborts generation when the response consumer disconnects", async () => {
  let aborted = false;
  mocks.stream.mockImplementation(({ abortSignal }) => ({
    stream: (async function* () {
      yield { type: "text-delta", text: "First" };
      await new Promise<void>((resolve) =>
        abortSignal.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
    })(),
  }));
  const response = await handleExplanationRequest(request(input));
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(aborted).toBe(true);
});
