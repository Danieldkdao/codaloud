import { expect, it, vi } from "vitest";
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
