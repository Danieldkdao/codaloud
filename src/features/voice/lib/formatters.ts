import type { VoiceState } from "../types";

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
