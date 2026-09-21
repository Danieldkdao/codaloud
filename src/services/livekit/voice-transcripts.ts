import type { VoiceSegment } from "@/features/voice/types";

type TranscriptReader = AsyncIterable<string> & {
  info: { id: string; attributes?: Record<string, string> };
};

export const createVoiceTranscriptReceiver = (
  identity: string,
  onSegment: (segment: VoiceSegment) => void,
) => {
  const versions = new Map<string, symbol>();
  return async (
    reader: TranscriptReader,
    participant: { identity: string },
  ) => {
    const attributes = reader.info.attributes ?? {};
    const id = attributes["lk.segment_id"] ?? reader.info.id;
    const version = Symbol();
    versions.set(id, version);
    const role = participant.identity === identity ? "user" : "assistant";
    let text = "";
    for await (const chunk of reader) {
      if (versions.get(id) !== version) return;
      text = (text + chunk).slice(-16_000);
      onSegment({ id, role, text, final: false });
    }
    if (versions.get(id) === version) {
      onSegment({
        id,
        role,
        text,
        final:
          role === "assistant" ||
          attributes["lk.transcription_final"] === "true",
      });
    }
  };
};
