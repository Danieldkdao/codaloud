import { expect, it, vi } from "vitest";
import { initializeLogger, llm } from "@livekit/agents";
import { VoiceLanguageModel } from "../voice-llm";
vi.mock("@/features/billing/server/billing-service", () => ({
  chargeCredits: vi.fn(),
  requireAvailableCredits: vi.fn(),
  InsufficientCreditsError: class extends Error {},
}));
import {
  chargeCredits,
  InsufficientCreditsError,
  requireAvailableCredits,
} from "@/features/billing/server/billing-service";
const mocks = vi.hoisted(() => ({
  reply: vi.fn(),
  edit: vi.fn(),
  classify: vi.fn().mockResolvedValue("edit"),
}));
vi.mock("@/services/ai/quick-edit", () => ({ streamQuickEdit: mocks.edit }));
vi.mock("@/services/ai/voice-response", () => ({
  createVoiceReply: mocks.reply,
}));
vi.mock("@/services/ai/inline-intent", () => ({
  classifyInlineIntent: mocks.classify,
}));
initializeLogger({ pretty: false, level: "silent" });
it("reports exhausted credits to the inline editor instead of failing the voice provider", async () => {
  vi.mocked(requireAvailableCredits).mockRejectedValueOnce(
    new InsufficientCreditsError(),
  );
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({ role: "user", content: "Edit this function" });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({
      id: "inline",
      projectId: "p",
      branch: "main",
      mode: "quick-edit",
      openFiles: [],
      openFilesTruncated: false,
      activeFile: {
        path: "a.ts", documentKey: "doc", revision: 1,
        from: 0, to: 0, before: "", selected: "", after: "",
        selectionTruncated: false,
      },
    }),
    rpc,
  }, "owner").chat({ chatCtx: chat });
  for await (const _ of stream) { /* drain */ }
  expect(rpc).toHaveBeenCalledWith("codaloud.voice.suggestion", {
    id: "inline",
    type: "error",
    message: expect.stringMatching(/credits.*(upgrade|add)/i),
  });
  stream.close();
});
it("reports a credit charge rejected after generating an inline edit", async () => {
  mocks.classify.mockResolvedValueOnce("edit");
  vi.mocked(chargeCredits).mockRejectedValueOnce(new InsufficientCreditsError());
  mocks.edit.mockImplementationOnce(
    async (_messages, _instruction, id, send, _signal, _target, onComplete) => {
      await send({ id, type: "start" });
      await onComplete({ inputTokens: 100, outputTokens: 100 });
    },
  );
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({ role: "user", content: "Edit this function" });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({
      id: "inline", projectId: "p", branch: "main", mode: "quick-edit",
      openFiles: [], openFilesTruncated: false,
      activeFile: {
        path: "a.ts", documentKey: "doc", revision: 1,
        from: 0, to: 0, before: "", selected: "", after: "",
        selectionTruncated: false,
      },
    }),
    rpc,
  }, "owner").chat({ chatCtx: chat });
  for await (const _ of stream) { /* drain */ }
  expect(rpc).toHaveBeenLastCalledWith("codaloud.voice.suggestion", {
    id: "inline", type: "error",
    message: expect.stringMatching(/credits.*(upgrade|add)/i),
  });
  stream.close();
});
it("reports a credit charge rejected after a conversational voice reply", async () => {
  vi.mocked(chargeCredits).mockRejectedValueOnce(new InsufficientCreditsError());
  mocks.reply.mockImplementationOnce(
    (_messages, _id, _signal, _tools, _context, onComplete) =>
      (async function* () {
        await onComplete("openai/gpt-5.4-mini", { inputTokens: 100, outputTokens: 100 });
        yield "Answer";
      })(),
  );
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({ role: "user", content: "Explain this" });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({
      id: "answer", projectId: "p", branch: "main", mode: "agent",
      openFiles: [], openFilesTruncated: false, activeFile: null,
    }),
    rpc,
  }, "owner").chat({ chatCtx: chat });
  for await (const _ of stream) { /* drain */ }
  expect(rpc).toHaveBeenLastCalledWith("codaloud.voice.suggestion", {
    id: "answer", type: "error",
    message: expect.stringMatching(/credits.*(upgrade|add)/i),
  });
  stream.close();
});
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
    undefined,
    "openai/gpt-5.4-mini",
  );
  expect(rpc).toHaveBeenLastCalledWith("codaloud.voice.suggestion", {
    id: "inline",
    type: "complete",
  });
  expect(
    chunks
      .filter((part) => part.delta?.content)
      .map((part) => part.delta?.content)
      .join(""),
  ).toBe("The edit is ready to review.");
  stream.close();
});

it("reports a draft edit failure without closing the voice session", async () => {
  mocks.classify.mockResolvedValueOnce("edit");
  mocks.edit.mockImplementationOnce(
    async (_messages, _instruction, id, send) => {
      await send({ id, type: "start" });
      await send({ id, type: "delta", offset: 0, text: "partial" });
      throw new Error("The edit target is ambiguous. Select a unique section.");
    },
  );
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({ role: "user", content: "Change the function" });
  const stream = new VoiceLanguageModel("room", undefined, {
    context: async () => ({
      id: "inline",
      projectId: "draft:one",
      branch: "",
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
  }).chat({ chatCtx: chat });
  const chunks = [];
  for await (const part of stream) chunks.push(part);
  expect(rpc).toHaveBeenLastCalledWith("codaloud.voice.suggestion", {
    id: "inline",
    type: "error",
    message: "The edit target is ambiguous. Select a unique section.",
  });
  expect(
    chunks
      .map((part) => part.delta?.content)
      .filter(Boolean)
      .join(""),
  ).toContain("couldn’t finish");
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
    undefined,
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

it.each(["I wanted", "Never mind, stop", "um", "thanks"])(
  "stays silent for an ignored transcript: %s",
  async (transcript) => {
    mocks.edit.mockClear();
    mocks.reply.mockClear();
    mocks.classify.mockResolvedValueOnce("ignore");
    const rpc = vi.fn(async () => ({ ok: true }));
    const chat = new llm.ChatContext();
    chat.addMessage({ role: "user", content: "Add a function" });
    chat.addMessage({ role: "user", content: transcript });
    const stream = new VoiceLanguageModel("room", undefined, {
      context: async () => ({
        id: "inline",
        projectId: "p",
        branch: "main",
        mode: "quick-edit",
        activeFile: null,
        openFiles: [],
        openFilesTruncated: false,
      }),
      rpc,
    }).chat({ chatCtx: chat });
    for await (const _ of stream) {
      /* drain */
    }
    expect(mocks.classify).toHaveBeenLastCalledWith(
      transcript,
      expect.any(AbortSignal),
    );
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("codaloud.voice.suggestion", {
      id: "inline",
      type: "answer",
    });
    stream.close();
  },
);

it.each(["Why am I getting this error here?", "What is going on here?"])(
  "answers an explained transcript instead of staying silent: %s",
  async (transcript) => {
    mocks.edit.mockClear();
    mocks.reply.mockClear();
    mocks.classify.mockResolvedValueOnce("answer");
    mocks.reply.mockImplementation(() =>
      (async function* () {
        yield "That is a type error.";
      })(),
    );
    const rpc = vi.fn(async () => ({ ok: true }));
    const chat = new llm.ChatContext();
    chat.addMessage({ role: "user", content: "Add a function" });
    chat.addMessage({ role: "user", content: transcript });
    const stream = new VoiceLanguageModel("room", undefined, {
      context: async () => ({
        id: "inline",
        projectId: "p",
        branch: "main",
        mode: "quick-edit",
        activeFile: null,
        openFiles: [],
        openFilesTruncated: false,
      }),
      rpc,
    }).chat({ chatCtx: chat });
    const chunks = [];
    for await (const part of stream) chunks.push(part);
    expect(mocks.classify).toHaveBeenLastCalledWith(
      transcript,
      expect.any(AbortSignal),
    );
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.reply).toHaveBeenCalled();
    expect(
      chunks
        .filter((part) => part.delta?.content)
        .map((part) => part.delta?.content)
        .join(""),
    ).toBe("That is a type error.");
    stream.close();
  },
);

it("generates an inline edit for a question about what is wrong", async () => {
  mocks.reply.mockClear();
  mocks.edit.mockClear();
  mocks.classify.mockResolvedValueOnce("edit");
  mocks.edit.mockImplementation(async (_messages, _instruction, id, send) => {
    await send({ id, type: "start" });
    await send({ id, type: "complete" });
  });
  const rpc = vi.fn(async () => ({ ok: true }));
  const chat = new llm.ChatContext();
  chat.addMessage({
    role: "user",
    content: "Why am I getting this error here?",
  });
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
  }).chat({ chatCtx: chat });
  for await (const _ of stream) {
    /* drain */
  }
  expect(mocks.reply).not.toHaveBeenCalled();
  expect(mocks.edit).toHaveBeenCalled();
  stream.close();
});
