import { DataStreamErrorReason } from "livekit-client";
import type { VoiceSegment } from "@/features/voice/types";

type TranscriptReader = AsyncIterable<string> & {
  info: { id: string; attributes?: Record<string, string> };
};

// A trailer reason the sender uses on a normal close, and when a participant
// disconnects mid-stream; text already received is accurate, so it is not lost.
const expectedEnds: readonly number[] = [DataStreamErrorReason.AbnormalEnd];

// Reasons that mean the reader could not reconstruct what was sent: a missing,
// undecodable, oversized or unreadable payload.
const lossyEnds: readonly number[] = [
  DataStreamErrorReason.Incomplete,
  DataStreamErrorReason.DecodeFailed,
  DataStreamErrorReason.LengthExceeded,
  DataStreamErrorReason.PayloadTooLarge,
];

const reasonOf = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "reason" in error &&
  typeof error.reason === "number"
    ? error.reason
    : undefined;

const isExpectedEnd = (error: unknown) => {
  const reason = reasonOf(error);
  return reason !== undefined && expectedEnds.includes(reason);
};

/**
 * Whether this failure means transcript text was actually lost, and is worth
 * telling the user about.
 */
export const isLostTranscriptText = (error: unknown) => {
  if (isExpectedEnd(error)) return false;
  const reason = reasonOf(error);
  // Anything the transport did not classify is unknown, not lost. A plain Error
  // is almost never a data-stream failure at all.
  if (reason === undefined) return false;
  return lossyEnds.includes(reason);
};

export const createVoiceTranscriptReceiver = (
  identity: string,
  onSegment: (segment: VoiceSegment) => void,
) => {
  const versions = new Map<string, symbol>();
  const finalized = new Set<string>();
  // The last utterance spoken by the agent, so a reply the agent repeats on a
  // second stream is not shown twice.
  let lastAssistantText = "";
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
      // An interim snapshot may retain an unfinished segment ID across a reply, so
      // it belongs after that reply; a delayed final still updates its original row.
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
    let repeated = false;
    try {
      for await (const chunk of reader) {
        if (versions.get(key) !== version) return;
        // A settled turn re-sends what it already published; a chunk that restates
        // all text so far replaces it, since a genuine delta never starts with it.
        text = text && chunk.startsWith(text) ? chunk : text + chunk;
        text = text.slice(-16_000);
        // User streams are replacement snapshots, not assistant-style deltas.
        // Publish each complete snapshot so transport chunks cannot erase its tail.
        if (role === "assistant") {
          if (text.trim() && !assistantSegments.has(key)) {
            assistantSegments.add(key);
            assistantTurn++;
          }
          // A replayed reply is the same utterance, so drop it here too; otherwise
          // its interim update creates a second row the formatter reads out twice.
          if (text === lastAssistantText) {
            repeated = true;
            return;
          }
          // A listener that throws is caught by the transport's try below, which is
          // safe: an unclassified error is no longer reported as lost transcript.
          onSegment({ id, role, text, final: false });
        }
      }
    } catch (error) {
      // A superseded stream can reject while waiting for its next chunk, before
      // the loop's version check runs. It must not affect its replacement.
      if (versions.get(key) !== version) return;
      // Stop animating the received assistant text, but do not make it
      // authoritative: a later complete snapshot may still repair this row.
      if (role === "assistant" && text)
        onSegment({ id, role, text, final: true });
      throw error;
    }
    if (versions.get(key) === version) {
      if (final) finalized.add(key);
      // A settled reply republished when the turn closes is the same utterance, not
      // a second one, so it is dropped unless a user turn came in between.
      if (role === "assistant" && (repeated || text === lastAssistantText))
        return;
      if (role === "assistant") lastAssistantText = text;
      else lastAssistantText = "";
      onSegment({
        id,
        role,
        text,
        final,
      });
    }
  };
};
