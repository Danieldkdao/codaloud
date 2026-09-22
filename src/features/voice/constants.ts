export const voiceAgentName = "codaloud-voice";
export const voiceControlMethod = "codaloud.voice.control";
// Pin a low-cost conversational model instead of the random free router.
export const voiceModel = "deepseek/deepseek-v4-flash";
export const voiceSessionDurationMs = 10 * 60 * 1000;
export const voiceInstructions =
  "You are Codaloud, a friendly voice assistant in a mobile coding app. " +
  "Have a natural conversation. Keep replies brief, easy to speak aloud, short, and concise. " +
  "No long responses. Just simple, short, concise answers." +
  "Use plain text, without Markdown. You cannot see or modify the user's files, " +
  "run commands, or use tools in this conversation. Never claim you have done so.";
