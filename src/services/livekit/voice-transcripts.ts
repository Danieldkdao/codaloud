import type { VoiceSegment } from "@/features/voice/types";

type TranscriptReader = AsyncIterable<string> & {
  info: { id: string; attributes?: Record<string, string> };
};

export const createVoiceTranscriptReceiver = (
  identity: string,
  onSegment: (segment: VoiceSegment) => void,
) => {
  const versions = new Map<string, symbol>();
  const finalized = new Set<string>();
  let assistantTurn = 0;
  const assistantSegments = new Set<string>();
  const userSegments = new Map<string, { id: string; turn: number }>();
  return async (
    reader: TranscriptReader,
    participant: { identity: string },
  ) => {
    const attributes = reader.info.attributes ?? {};
    const wireId = attributes["lk.segment_id"] ?? reader.info.id;
    let id = wireId;
    if (participant.identity === identity) {
      const previous = userSegments.get(wireId);
      // Interim snapshots may retain an unfinished STT segment ID across a
      // reply. They belong after that reply, not in the earlier user's row.
      // A delayed final still updates its original row until new speech starts.
      if (
        !previous ||
        (previous.turn !== assistantTurn &&
          attributes["lk.transcription_final"] !== "true")
      ) {
        userSegments.set(wireId, {
          id: previous
            ? JSON.stringify([wireId, "turn", assistantTurn])
            : wireId,
          turn: assistantTurn,
        });
      }
      id = userSegments.get(wireId)!.id;
    }
    const key = JSON.stringify([participant.identity, id]);
    // Final snapshots are authoritative even if an older interim arrives later.
    if (finalized.has(key)) return;
    const final =
      participant.identity !== identity ||
      attributes["lk.transcription_final"] === "true";

    const version = Symbol();
    versions.set(key, version);
    const role = participant.identity === identity ? "user" : "assistant";
    let text = "";
    for await (const chunk of reader) {
      if (versions.get(key) !== version) return;
      text = (text + chunk).slice(-16_000);
      // User streams are replacement snapshots, not assistant-style deltas.
      // Publish each complete snapshot so transport chunks cannot erase its tail.
      if (role === "assistant") {
        if (text.trim() && !assistantSegments.has(key)) {
          assistantSegments.add(key);
          assistantTurn++;
        }
        onSegment({ id, role, text, final: false });
      }
    }
    if (versions.get(key) === version) {
      if (final) finalized.add(key);
      onSegment({
        id,
        role,
        text,
        final,
      });
    }
  };
};
