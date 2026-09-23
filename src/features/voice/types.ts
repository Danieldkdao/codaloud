import type { VoiceControlAction, VoiceMode } from "./schemas";
import type { EditorSnapshot, InlineSuggestion } from "@/features/editor/types";
import type { FileActivitySchema } from "@/features/agent/schemas";

export type VoiceEditorContext = {
  projectId: string;
  branch: string;
  activeFile: (EditorSnapshot & { path: string }) | null;
  openFiles: { path: string; content: string }[];
};
export type InlineEvent =
  | { id: string; type: "start" | "complete" | "answer" }
  | { id: string; type: "delta"; offset: number; text: string }
  | { id: string; type: "error"; message: string };
export type InlineRequest = {
  id: string;
  projectId: string;
  context: VoiceEditorContext | null;
  mode: "agent" | "quick-edit";
  status:
    | "listening"
    | "generating"
    | "ready"
    | "applying"
    | "answered"
    | "accepted"
    | "error";
  text: string;
  transcript: string;
  error?: string;
  files?: FileActivitySchema[];
  toolActivity?: string;
};
export type VoiceEditorBridge = {
  capture: () => Promise<VoiceEditorContext>;
  preview: (
    value: InlineSuggestion | null,
    context: VoiceEditorContext,
  ) => void;
  apply: (
    value: InlineSuggestion,
    context: VoiceEditorContext,
  ) => Promise<boolean>;
};

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
