import type { VoiceControlAction, VoiceMode } from "./schemas";

export type VoiceSegment = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
};
export type VoiceState = {
  connection: "idle" | "connecting" | "connected" | "error";
  mode: VoiceMode | null;
  listening: boolean;
  agentState: "listening" | "thinking" | "speaking";
  transcript: VoiceSegment[];
  error: string | null;
};
export type VoiceEvents = {
  onSegment: (segment: VoiceSegment) => void;
  onAgentState: (state: VoiceState["agentState"]) => void;
  onError: (message: string) => void;
};
export type VoiceConnection = {
  control: (action: VoiceControlAction) => Promise<void>;
  close: () => Promise<void>;
};
export type ConnectVoice = (
  mode: VoiceMode,
  signal: AbortSignal,
  events: VoiceEvents,
  options?: { projectId: string },
) => Promise<VoiceConnection>;
