import { expect, it, vi } from "vitest";
import { createVoiceController } from "@/features/voice/voice-controller";
import { formatVoiceTranscript } from "@/features/voice/lib/formatters";
import { createVoiceTranscriptReceiver } from "../voice-transcripts";
const reader = (id: string, chunks: string[], final = false) => ({
  info: {
    id: crypto.randomUUID(),
    attributes: {
      "lk.segment_id": id,
      "lk.transcription_final": String(final),
    },
  },
  async *[Symbol.asyncIterator]() {
    yield* chunks;
  },
});
it("replaces user interim text and appends assistant deltas", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  await receive(reader("u", ["Can you"]), { identity: "user" });
  await receive(reader("u", ["Can you help?"], true), { identity: "user" });
  await receive(reader("a", ["Of ", "course"]), { identity: "agent" });
  expect(update).toHaveBeenCalledWith({
    id: "u",
    role: "user",
    text: "Can you help?",
    final: true,
  });
  expect(update).toHaveBeenLastCalledWith({
    id: "a",
    role: "assistant",
    text: "Of course",
    final: true,
  });
});
it("does not let an older slow interim overwrite a final segment", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const slow = {
    ...reader("u", []),
    async *[Symbol.asyncIterator]() {
      await wait;
      yield "old";
    },
  };
  const pending = receive(slow, { identity: "user" });
  await receive(reader("u", ["new"], true), { identity: "user" });
  finish();
  await pending;
  expect(update).not.toHaveBeenCalledWith(
    expect.objectContaining({ text: "old" }),
  );
});

it("does not replace a finalized user turn with a delayed interim snapshot", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  await receive(reader("u", ["This is actually complete."], true), {
    identity: "user",
  });
  update.mockClear();
  await receive(reader("u", ["This is actually"]), { identity: "user" });
  expect(update).not.toHaveBeenCalled();
});

it("publishes user snapshots atomically instead of truncating the previous text per chunk", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  await receive(reader("u", ["This is actually"]), { identity: "user" });
  update.mockClear();
  await receive(reader("u", ["This ", "is actually complete."], true), {
    identity: "user",
  });
  expect(update).toHaveBeenCalledExactlyOnceWith({
    id: "u",
    role: "user",
    text: "This is actually complete.",
    final: true,
  });
});

it.each([false, true])(
  "keeps user-agent-user turns separate when the first user segment is final=%s",
  async (firstFinal) => {
    let receive!: ReturnType<typeof createVoiceTranscriptReceiver>;
    const controller = createVoiceController(async (_mode, _signal, events) => {
      receive = createVoiceTranscriptReceiver("user", events.onSegment);
      return { control: async () => {}, close: async () => {} };
    });
    await controller.start("hands-free");
    await receive(reader("u", ["First question"], firstFinal), {
      identity: "user",
    });
    await receive(reader("a1", ["First answer"]), { identity: "agent" });
    await receive(reader("u", ["Second"]), { identity: "user" });
    await receive(reader("u", ["Second question"], true), { identity: "user" });
    await receive(reader("a2", ["Second answer"]), { identity: "agent" });
    expect(
      formatVoiceTranscript(controller.getSnapshot().transcript).map(
        ({ role, text }) => ({ role, text }),
      ),
    ).toEqual([
      { role: "user", text: "First question" },
      { role: "assistant", text: "First answer" },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer" },
    ]);
    await controller.stop();
  },
);

it("allows a delayed final to finish its original user row after an agent reply", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  await receive(reader("u", ["First"]), { identity: "user" });
  await receive(reader("a", ["Answer"]), { identity: "agent" });
  await receive(reader("u", ["First question"], true), { identity: "user" });
  expect(update).toHaveBeenLastCalledWith({
    id: "u",
    role: "user",
    text: "First question",
    final: true,
  });
});
it("ignores a rejected obsolete reader after a newer final snapshot wins", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  let reject!: (reason: Error) => void;
  const pending = receive(
    {
      ...reader("u", []),
      async *[Symbol.asyncIterator]() {
        await new Promise<void>((_resolve, fail) => {
          reject = fail;
        });
      },
    },
    { identity: "user" },
  );
  await receive(reader("u", ["Read the current file"], true), {
    identity: "user",
  });
  reject(new Error("Old reader closed"));
  await expect(pending).resolves.toBeUndefined();
  expect(update).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ text: "Read the current file", final: true }),
  );
});
it("settles a failed assistant preview without blocking a replacement snapshot", async () => {
  const update = vi.fn();
  const receive = createVoiceTranscriptReceiver("user", update);
  await expect(
    receive(
      {
        ...reader("a", []),
        async *[Symbol.asyncIterator]() {
          yield "Partial explanation";
          throw new Error("gap");
        },
      },
      { identity: "agent" },
    ),
  ).rejects.toThrow("gap");
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "Partial explanation", final: true }),
  );
  await receive(reader("a", ["Complete explanation"]), { identity: "agent" });
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "Complete explanation", final: true }),
  );
});
