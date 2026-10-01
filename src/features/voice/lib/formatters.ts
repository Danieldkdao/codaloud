import type { VoiceSegment, VoiceState } from "../types";
import type { CommandNavigationSchema } from "../command-navigation";
export const formatCommandInputTitle = (mode: "agent" | "quick-edit") => {
  switch (mode) {
    case "agent":
      return "Codaloud";
    case "quick-edit":
      return "Quick edit";
  }
};
export const formatLocalCommandReply = (
  input: CommandNavigationSchema,
): string => {
  switch (input.target) {
    case "files":
      return "Opened files.";
    case "git":
      return "Opened Git.";
    case "agent":
      return "Opened the agent log.";
    case "terminal":
      return input.open === false
        ? "Closed the terminal."
        : "Opened the terminal.";
    case "code":
      return "Opened the editor.";
    case "back":
      return "Returned to the project editor.";
  }
};

export const formatVoiceStatus = (
  state: VoiceState,
  quickEdit = false,
): string => {
  switch (state.connection) {
    case "idle":
      return quickEdit ? "Tap to speak" : "Ready to listen";
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
            : quickEdit
              ? "Tap to speak again"
              : "Ready to listen";
      }
  }
};

export const formatVoiceInstructions = (quickEdit: boolean): string =>
  quickEdit
    ? "Tap the microphone to speak. Tap it again to send."
    : "Hold the microphone to talk, or double-tap for hands-free.";

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
