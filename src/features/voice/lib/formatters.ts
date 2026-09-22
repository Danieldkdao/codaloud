import type { VoiceSegment, VoiceState } from "../types";

export const formatVoiceStatus = (state: VoiceState): string => {
  switch (state.connection) {
    case "idle":
      return "Hold to talk · Double-tap for hands-free";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Voice unavailable";
    case "connected":
      switch (state.agentState) {
        case "thinking":
          return "Thinking…";
        case "speaking":
          return "Speaking…";
        case "listening":
          return state.listening
            ? state.mode === "hold"
              ? "Listening · Release to send"
              : "Hands-free · Listening"
            : "Hold to speak again";
      }
  }
};

// Group only for display; original segment IDs must survive interim STT updates.
export const formatVoiceTranscript = (
  segments: VoiceSegment[],
): VoiceSegment[] => {
  const groups: VoiceSegment[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const previous = groups.at(-1);
    if (previous?.role === segment.role) {
      previous.text += " " + text;
      previous.final = previous.final && segment.final;
    } else {
      groups.push({ ...segment, text });
    }
  }
  return groups;
};
