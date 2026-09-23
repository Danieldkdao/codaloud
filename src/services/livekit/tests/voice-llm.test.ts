import { expect, it, vi } from "vitest";
import { initializeLogger, llm } from "@livekit/agents";
import { VoiceLanguageModel } from "../voice-llm";
const mocks = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock("@/services/ai/voice-response", () => ({
  createVoiceReply: mocks.reply,
}));
initializeLogger({ pretty: false, level: "silent" });
it("passes a concise title with the instruction and accepts each turn only once", async () => {
  const start = vi.fn().mockResolvedValue({ accepted: true });
  mocks.reply.mockImplementation((_messages, _id, _signal, tools) =>
    (async function* () {
      await tools.startTask.execute(
        {
          instruction: "List the files in the project root",
          title: "Browse project",
        },
        { toolCallId: "call-one" },
      );
      await tools.startTask.execute(
        { instruction: "List files again", title: "Another title" },
        { toolCallId: "call-two" },
      );
      yield "Started";
    })(),
  );
  const context = new llm.ChatContext();
  context.addMessage({ role: "user", content: "Show my files" });
  const stream = new VoiceLanguageModel("room", start).chat({
    chatCtx: context,
  });
  for await (const _ of stream) {
    /* Drain the generated reply. */
  }
  expect(start).toHaveBeenCalledExactlyOnceWith(
    "List the files in the project root",
    expect.stringMatching(/^[a-f0-9-]{36}$/),
    "Browse project",
  );
  stream.close();
});
it("assigns different request IDs to separate turns even if the provider reuses a tool-call ID", async () => {
  const requests = new Map<string, string>();
  const start = vi.fn(async (instruction: string, id: string) => {
    if (!requests.has(id)) requests.set(id, instruction);
    return { accepted: true, id };
  });
  mocks.reply.mockImplementation((messages, _id, _signal, tools) =>
    (async function* () {
      await tools.startTask.execute(
        { instruction: messages.at(-1).content, title: "Create file" },
        { toolCallId: "call_0" },
      );
      yield "Started";
    })(),
  );
  const model = new VoiceLanguageModel("same-room", start);
  const context = new llm.ChatContext();
  for (const instruction of ["Create first.ts", "Create second.ts"]) {
    context.addMessage({ role: "user", content: instruction });
    const stream = model.chat({ chatCtx: context });
    for await (const _ of stream) {
      /* drain this turn */
    }
    stream.close();
    context.addMessage({ role: "assistant", content: "Started" });
  }
  expect([...requests.values()]).toEqual([
    "Create first.ts",
    "Create second.ts",
  ]);
  expect(start.mock.calls[0][1]).not.toBe(start.mock.calls[1][1]);
});
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
    undefined,
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
