import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { voiceModel } from "@/features/voice/constants";
import { createVoiceReply } from "../voice-response";
const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  model: vi.fn(),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.stream,
}));
vi.mock("../server", () => ({ openrouter: { chat: mocks.model } }));
beforeEach(() => {
  mocks.stream.mockReset();
  mocks.model.mockReturnValue("free-model");
});
it("streams one configured model call with bounded history and no tools or retries", async () => {
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "Hello" };
      yield { type: "text-delta", text: " there" };
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
  expect(mocks.model).toHaveBeenCalledWith(voiceModel);
  expect(mocks.stream).toHaveBeenCalledOnce();
  const options = mocks.stream.mock.calls[0]![0];
  expect(options.messages).toHaveLength(12);
  expect(options.messages.at(-1).content).toBe("message-29");
  expect(options).toMatchObject({
    maxRetries: 0,
    maxOutputTokens: 512,
    headers: { "X-Session-Id": "room-one" },
    providerOptions: { openrouter: { reasoning: { enabled: false } } },
  });
  expect(options.tools).toBeUndefined();
});

it("does not log intentional cancellation but still logs provider failures", async () => {
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "Hello" };
    })(),
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const abort = new AbortController();
  const iterator = createVoiceReply(
    [{ role: "user", content: "Hi" }],
    "room",
    abort.signal,
  )[Symbol.asyncIterator]();
  const options = mocks.stream.mock.calls.at(-1)![0];
  const failure = new Error("Provider unavailable");
  options.onError({ error: failure });
  expect(log).toHaveBeenCalledWith("[voice] Model stream failed", failure);
  log.mockClear();
  abort.abort();
  options.onError({ error: abort.signal.reason });
  expect(log).not.toHaveBeenCalled();
  await iterator.return?.();
});
it("aborts model generation when the consumer interrupts", async () => {
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "Hello" };
      yield { type: "text-delta", text: " later" };
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
    stream: (async function* () {
      throw new Error("unavailable");
      yield { type: "text-delta", text: "" };
    })(),
  });
  const iterator = createVoiceReply([{ role: "user", content: "Hi" }], "room")[
    Symbol.asyncIterator
  ]();
  await expect(iterator.next()).rejects.toThrow("unavailable");
});

it("cancels an active real AI SDK stream without printing AbortError", async () => {
  const { streamText } = await vi.importActual<typeof import("ai")>("ai");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start: (source) => {
          abortSignal!.addEventListener(
            "abort",
            () => source.error(abortSignal!.reason),
            { once: true },
          );
          source.enqueue({ type: "stream-start", warnings: [] });
          source.enqueue({ type: "text-start", id: "reply" });
          source.enqueue({ type: "text-delta", id: "reply", delta: "Hello" });
        },
      }),
    }),
  });
  mocks.model.mockReturnValue(model);
  mocks.stream.mockImplementation(streamText);
  const abort = new AbortController();
  const iterator = createVoiceReply(
    [{ role: "user", content: "Hi" }],
    "room",
    abort.signal,
  )[Symbol.asyncIterator]();
  expect(await iterator.next()).toMatchObject({ value: "Hello" });
  abort.abort();
  await iterator.next().catch(() => {});
  await iterator.return?.();
  expect(model.doStreamCalls).toHaveLength(1);
  expect(model.doStreamCalls[0]!.abortSignal!.aborted).toBe(true);
  expect(log).not.toHaveBeenCalled();
});

it.each(["rate limit", "empty", "partial failure"])(
  "surfaces real AI SDK %s instead of silently ending the reply",
  async (kind) => {
    const { streamText } = await vi.importActual<typeof import("ai")>("ai");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start: (source) => {
            source.enqueue({ type: "stream-start", warnings: [] });
            if (kind === "partial failure") {
              source.enqueue({ type: "text-start", id: "reply" });
              source.enqueue({
                type: "text-delta",
                id: "reply",
                delta: "Hello",
              });
            }
            if (kind !== "empty")
              source.enqueue({
                type: "error",
                error: new Error("Provider rate limit"),
              });
            source.close();
          },
        }),
      }),
    });
    mocks.model.mockReturnValue(model);
    mocks.stream.mockImplementation(streamText);
    const consume = async () => {
      for await (const _text of createVoiceReply(
        [{ role: "user", content: "Hi" }],
        "room",
      )) {
      }
    };
    await expect(consume()).rejects.toThrow(
      kind === "empty" ? "No output generated" : "Provider rate limit",
    );
  },
);

it("rejects a completed but empty text response", async () => {
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: " " };
    })(),
  });
  const consume = async () => {
    for await (const _text of createVoiceReply([], "room")) {
    }
  };
  await expect(consume()).rejects.toThrow("empty response");
});

it("exposes background tools only when supplied and bounds the acknowledgement loop", async () => {
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "Working on it." };
    })(),
  });
  const tools = {
    startTask: { description: "Start a task", inputSchema: {} },
  } as unknown as import("ai").ToolSet;
  for await (const _text of createVoiceReply(
    [{ role: "user", content: "Read the readme" }],
    "room",
    undefined,
    tools,
  )) {
    /* consume */
  }
  expect(mocks.stream.mock.calls[0][0].tools).toBe(tools);
  expect(mocks.stream.mock.calls[0][0].stopWhen).toBeDefined();
});
