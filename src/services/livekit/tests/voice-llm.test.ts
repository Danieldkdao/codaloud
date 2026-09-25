import { expect, it, vi } from "vitest";
import { initializeLogger, llm } from "@livekit/agents";
import { VoiceLanguageModel } from "../voice-llm";
const mocks = vi.hoisted(() => ({ reply: vi.fn(), edit: vi.fn(), classify: vi.fn().mockResolvedValue(true) }));
vi.mock("@/services/ai/quick-edit", () => ({ streamQuickEdit: mocks.edit }));
vi.mock("@/services/ai/voice-response", () => ({
  createVoiceReply: mocks.reply,
}));
vi.mock("@/services/ai/inline-edit-intent", () => ({ classifyInlineEditIntent: mocks.classify }));
initializeLogger({ pretty: false, level: "silent" });
it("generates an inline edit directly without asking the conversation model to call a tool", async () => {
  mocks.reply.mockClear();
  mocks.edit.mockImplementation(async (_messages, _instruction, id, send) => {
    await send({ id, type: "start" });
    await send({ id, type: "delta", offset: 0, text: "const value = 42;" });
    await send({ id, type: "complete" });
  });
  const rpc = vi.fn(async () => ({ ok: true }));
  const context = new llm.ChatContext();
  context.addMessage({ role: "user", content: "Insert a value of forty two" });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({
      id: "inline",
      projectId: "p",
      branch: "main",
      mode: "quick-edit",
      openFiles: [],
      openFilesTruncated: false,
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        from: 0,
        to: 0,
        before: "",
        selected: "",
        after: "",
        selectionTruncated: false,
      },
    }),
    rpc,
  }).chat({ chatCtx: context });
  const chunks = [];
  for await (const part of stream) chunks.push(part);
  expect(mocks.reply).not.toHaveBeenCalled();
  expect(mocks.edit).toHaveBeenCalledWith(
    expect.any(Array),
    "Insert a value of forty two",
    "inline",
    expect.any(Function),
    expect.any(AbortSignal),
    { source: "", offset: 0, caret: 0 },
  );
  expect(rpc).toHaveBeenLastCalledWith("codaloud.voice.suggestion", {
    id: "inline",
    type: "complete",
  });
  expect(chunks.filter((part) => part.delta?.content)).toEqual([]);
  stream.close();
});
it("passes a concise title with the instruction and accepts each turn only once", async () => {
  const start = vi.fn().mockResolvedValue({ accepted: true });
  mocks.reply.mockImplementation((_messages, _id, _signal, tools) =>
    (async function* () {
      expect(tools.startTask).toBeUndefined();
      await tools.proposePlan.execute(
        {
          instruction: "List the files in the project root",
          title: "Browse project",
        },
        { toolCallId: "call-one" },
      );
      await tools.proposePlan.execute(
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
      await tools.proposePlan.execute(
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
it("binds implementation plans to the frozen native request", async () => {
  const propose = vi.fn(async () => ({ reviewRequired: true }));
  mocks.reply.mockImplementation((_messages, _id, _signal, tools) =>
    (async function* () {
      await tools.proposePlan.execute(
        { instruction: "Build settings", title: "Settings" },
        {},
      );
      yield "Review the plan";
    })(),
  );
  const context = new llm.ChatContext();
  context.addMessage({ role: "user", content: "Build settings" });
  const stream = new VoiceLanguageModel("room", propose, {
    context: async () => ({
      id: "frozen",
      projectId: "p",
      branch: "main",
      mode: "agent",
      activeFile: null,
      openFiles: [],
      openFilesTruncated: false,
    }),
    rpc: async () => ({ ok: true }),
  }).chat({ chatCtx: context });
  for await (const _ of stream) {
    /* Drain response. */
  }
  expect(propose).toHaveBeenCalledWith(
    "Build settings",
    expect.any(String),
    "Settings",
    "frozen",
  );
  stream.close();
});

it.each(["I wanted", "Never mind, stop", "What's wrong with this code?"])("does not generate code for a rejected transcript: %s", async (transcript) => {
  mocks.edit.mockClear();
  mocks.classify.mockResolvedValueOnce(false);
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({ role: "user", content: "Add a function" });
  chat.addMessage({ role: "user", content: transcript });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({ id: "inline", projectId: "p", branch: "main", mode: "quick-edit", activeFile: null, openFiles: [], openFilesTruncated: false }), rpc,
  }).chat({ chatCtx: chat });
  for await (const _ of stream) { /* drain */ }
  expect(mocks.classify).toHaveBeenLastCalledWith(transcript, expect.any(AbortSignal));
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("codaloud.voice.suggestion", { id: "inline", type: "answer" });
  stream.close();
});
