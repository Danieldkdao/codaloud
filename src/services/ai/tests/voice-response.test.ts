import { expect, it, vi } from "vitest";
import { createVoiceReply } from "../voice-response";
const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  model: vi.fn(() => "free-model"),
}));
vi.mock("ai", () => ({ streamText: mocks.stream }));
vi.mock("../server", () => ({ openrouter: { chat: mocks.model } }));
it("streams one free model call with bounded history and no tools or retries", async () => {
  mocks.stream.mockReturnValue({
    textStream: (async function* () {
      yield "Hello";
      yield " there";
    })(),
  });
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: "user" as const,
    content: `message-${i}`,
  }));
  const result: string[] = [];
  for await (const text of createVoiceReply(history, "room-one"))
    result.push(text);
  expect(result.join("")).toBe("Hello there");
  expect(mocks.model).toHaveBeenCalledWith("openrouter/free");
  expect(mocks.stream).toHaveBeenCalledOnce();
  const options = mocks.stream.mock.calls[0]![0];
  expect(options.messages).toHaveLength(12);
  expect(options.messages.at(-1).content).toBe("message-29");
  expect(options).toMatchObject({
    maxRetries: 0,
    maxOutputTokens: 512,
    headers: { "X-Session-Id": "room-one" },
  });
  expect(options.tools).toBeUndefined();
});
it("aborts model generation when the consumer interrupts", async () => {
  mocks.stream.mockReturnValue({
    textStream: (async function* () {
      yield "Hello";
      yield " later";
    })(),
  });
  const iterator = createVoiceReply([{ role: "user", content: "Hi" }], "room")[
    Symbol.asyncIterator
  ]();
  await iterator.next();
  const signal = mocks.stream.mock.calls[0]![0].abortSignal;
  await iterator.return?.();
  expect(signal.aborted).toBe(true);
});
it("propagates upstream errors so the voice session can show failure", async () => {
  mocks.stream.mockReturnValue({
    textStream: (async function* () {
      throw new Error("unavailable");
      yield "";
    })(),
  });
  const iterator = createVoiceReply([{ role: "user", content: "Hi" }], "room")[
    Symbol.asyncIterator
  ]();
  await expect(iterator.next()).rejects.toThrow("unavailable");
});
