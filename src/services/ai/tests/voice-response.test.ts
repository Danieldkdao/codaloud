import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
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
vi.mock("../server", () => ({ meteredChatModel: mocks.model }));
beforeEach(() => {
  mocks.stream.mockReset();
  mocks.model.mockReturnValue("free-model");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

it.each([1, 5, 6, 20])(
  "answers after up to %i file-read steps instead of ending after a spoken preamble",
  async (requestedReads) => {
    const { streamText, tool } =
      await vi.importActual<typeof import("ai")>("ai");
    const read = vi.fn(async () => ({
      content: "file excerpt",
      nextOffset: 1200,
    }));
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async ({ toolChoice }) => {
        const current = step++;
        const answer = current >= requestedReads || toolChoice?.type === "none";
        return {
          stream: new ReadableStream({
            start: (source) => {
              source.enqueue({ type: "stream-start", warnings: [] });
              if (current === 0 || answer) {
                source.enqueue({ type: "text-start", id: "reply" });
                source.enqueue({
                  type: "text-delta",
                  id: "reply",
                  delta: answer
                    ? "The part I read handles authentication. I have not inspected the whole file."
                    : "Let me read the full file to spot any issues. ",
                });
                source.enqueue({ type: "text-end", id: "reply" });
              }
              if (!answer)
                source.enqueue({
                  type: "tool-call",
                  toolCallId: `read-${current}`,
                  toolName: "readFile",
                  input: JSON.stringify({ offset: current * 1200 }),
                });
              source.enqueue({
                type: "finish",
                finishReason: {
                  unified: answer ? "stop" : "tool-calls",
                  raw: undefined,
                },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 10, text: 10, reasoning: undefined },
                },
              });
              source.close();
            },
          }),
        };
      },
    });
    mocks.model.mockReturnValue(model);
    mocks.stream.mockImplementation(streamText);
    let spoken = "";
    for await (const text of createVoiceReply(
      [{ role: "user", content: "Read the full file to spot any issues." }],
      "room",
      undefined,
      {
        readFile: tool({
          inputSchema: z.object({ offset: z.number() }),
          execute: read,
        }),
      },
    ))
      spoken += text;
    expect(spoken).toContain("The part I read handles authentication.");
    const reads = Math.min(requestedReads, 6);
    expect(read).toHaveBeenCalledTimes(reads);
    expect(model.doStreamCalls).toHaveLength(reads + 1);
    if (requestedReads >= 6) {
      expect(model.doStreamCalls.at(-1)!.toolChoice).toEqual({ type: "none" });
      expect(model.doStreamCalls.at(-1)!.tools).toBeUndefined();
      expect(JSON.stringify(model.doStreamCalls.at(-1)!.prompt)).toContain(
        "Explicitly disclose any incomplete file read",
      );
    }
    expect(console.info).toHaveBeenCalledWith(
      "[voice] Tool started",
      expect.objectContaining({ tool: "readFile" }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[voice] Tool completed",
      expect.objectContaining({ tool: "readFile", success: true }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[voice] Model step completed",
      expect.objectContaining({ step: reads + 1, finishReason: "stop" }),
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      "file excerpt",
    );
  },
);

it("never speaks or transcribes the preamble that precedes a tool call", async () => {
  // Text in a step that ends on a tool call is the model narrating its next move,
  // so it must not be spoken ahead of the real reply.
  const { tool } = await vi.importActual<typeof import("ai")>("ai");
  const read = vi.fn(async () => ({ content: "excerpt" }));
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "start-step" };
      yield {
        type: "text-delta",
        text: "I'll search for shell and Ruby files. ",
      };
      yield { type: "finish-step", finishReason: "tool-calls" };
      yield { type: "start-step" };
      yield { type: "text-delta", text: "I'll read both files. " };
      yield { type: "finish-step", finishReason: "tool-calls" };
      yield { type: "start-step" };
      yield {
        type: "text-delta",
        text: "You have shell and Ruby files.",
      };
      yield { type: "finish-step", finishReason: "stop" };
    })(),
  });
  const spoken: string[] = [];
  for await (const text of createVoiceReply([], "room", undefined, {
    readFile: tool({
      inputSchema: z.object({ offset: z.number() }),
      execute: read,
    }),
  }))
    spoken.push(text);
  expect(spoken.join("")).toBe("You have shell and Ruby files.");
  expect(spoken.join("")).not.toMatch(/I'll (search|read)/);
});

it("reports final model usage after a usable reply", async () => {
  const settle = vi.fn(async () => {});
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "start-step" };
      yield { type: "text-delta", text: "Done." };
      yield { type: "finish-step", finishReason: "stop" };
    })(),
    usage: Promise.resolve({ inputTokens: 10_000, outputTokens: 1_000 }),
    finalStep: Promise.resolve({
      providerMetadata: { openrouter: { usage: { cost: 0.008 } } },
    }),
  });
  const chunks: string[] = [];
  for await (const chunk of createVoiceReply(
    [],
    "room",
    undefined,
    undefined,
    undefined,
    settle,
  ))
    chunks.push(chunk);
  expect(chunks).toEqual(["Done."]);
  expect(settle).toHaveBeenCalledWith("deepseek/deepseek-v4.1-flash", {
    inputTokens: 10_000,
    outputTokens: 1_000,
    costUsd: 0.008,
  });
});

it("streams a tool-free reply as fast as it arrives", async () => {
  // Without tools there is no preamble to suppress, so the whole reply is the
  // answer and must not be buffered: that buffering is time-to-first-audio.
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "start-step" };
      yield { type: "text-delta", text: "First half. " };
      yield { type: "text-delta", text: "Second half." };
      yield { type: "finish-step", finishReason: "stop" };
    })(),
  });
  const iterator = createVoiceReply([], "room")[Symbol.asyncIterator]();
  expect((await iterator.next()).value).toBe("First half. ");
  await iterator.return?.();
});

it.each(["empty", "length", "tool-calls"])(
  "does not mistake an earlier preamble for a completed answer when the last step is %s",
  async (ending) => {
    mocks.stream.mockReturnValue({
      stream: (async function* () {
        yield { type: "start-step" };
        yield { type: "text-delta", text: "Let me read that. " };
        yield { type: "finish-step", finishReason: "tool-calls" };
        yield { type: "start-step" };
        if (ending === "length")
          yield { type: "text-delta", text: "The issue is" };
        yield {
          type: "finish",
          finishReason: ending === "empty" ? "stop" : ending,
        };
      })(),
    });
    const consume = async () => {
      for await (const _text of createVoiceReply([], "room")) {
        /* consume */
      }
    };
    await expect(consume()).rejects.toThrow(
      /empty response|without a complete answer/,
    );
  },
);
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
    maxOutputTokens: 1600,
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
