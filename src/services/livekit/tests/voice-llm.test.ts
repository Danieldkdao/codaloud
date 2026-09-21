import { expect, it, vi } from "vitest";
import { initializeLogger, llm } from "@livekit/agents";
import { VoiceLanguageModel } from "../voice-llm";
const mocks = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/services/ai/voice-response", () => ({
  createVoiceReply: mocks.reply,
}));
initializeLogger({ pretty: false, level: "silent" });
it("adapts a committed text conversation to LiveKit response chunks", async () => {
  mocks.reply.mockReturnValue(
    (async function* () {
      yield "Hello";
      yield " friend";
    })(),
  );
  const context = new llm.ChatContext();
  context.addMessage({ role: "system", content: "internal instruction" });
  context.addMessage({ role: "user", content: "Hi" });
  const model = new VoiceLanguageModel("room");
  const stream = model.chat({ chatCtx: context });
  const chunks: string[] = [];
  for await (const part of stream)
    if (part.delta?.content) chunks.push(part.delta.content);
  expect(chunks.join("")).toBe("Hello friend");
  expect(mocks.reply).toHaveBeenCalledWith(
    [{ role: "user", content: "Hi" }],
    "room",
    expect.any(AbortSignal),
  );
  stream.close();
});
it("closes the upstream generation on interruption", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  mocks.reply.mockImplementation((_messages, _id, signal: AbortSignal) =>
    (async function* () {
      started();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      yield "";
    })(),
  );
  const context = new llm.ChatContext();
  context.addMessage({ role: "user", content: "Hi" });
  const stream = new VoiceLanguageModel("room").chat({ chatCtx: context });
  await ready;
  stream.close();
  expect(mocks.reply.mock.calls[0]![2].aborted).toBe(true);
});
