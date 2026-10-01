import type { EditorPreferences } from "./types";
import {
  defaultAgentModel,
  defaultInlineModel,
} from "@/features/billing/model-catalog";

export const editorThemes = [
  "Codaloud",
  "GitHub Light",
  "Solarized Light",
  "Rose Pine Dawn",
  "Quiet Light",
  "One Dark",
  "Dracula",
  "GitHub Dark",
  "Tokyo Night",
] as const;
export const editorFonts = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
] as const;
export const defaultEditorPreferences: EditorPreferences = {
  inlineModel: defaultInlineModel,
  agentModel: defaultAgentModel,
  allowLargeSync: false,
  syncAllowedPaths:
    "node_modules\n__pycache__\n.expo\n.next\ndist\nbuild\ncoverage\n.venv\nvenv",
  aiDisabledPaths:
    ".env*\nnode_modules\n__pycache__\n.git\n.expo\n.next\ndist\nbuild\ncoverage\n.venv\nvenv",
  speechEnabled: true,
  textMode: false,
  voiceId: "JBFqnCBsd6RMkjVDRZzb",
  theme: "Codaloud",
  font: "JetBrains Mono",
  fontSize: 16,
  tabSize: 2,
  wordWrap: false,
  lineNumbers: true,
  minimap: false,
  useTabs: false,
  keepIndentation: true,
  closeBrackets: true,
};

export const editorScreenOptions = {
  headerBackButtonDisplayMode: "minimal",
  headerShadowVisible: false,
  headerTransparent: true,
  title: "",
} as const;

// Public premade catalog verified September 2026. These legacy IDs retire on
// December 31, 2026; replace the catalog before then without changing stored IDs silently.
export const voicePresets = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    description: "Warm British storyteller",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    description: "Reassuring American voice",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    description: "Energetic Australian voice",
  },
  {
    id: "SAz9YHcvj6GT2YYXdXww",
    name: "River",
    description: "Relaxed, neutral American voice",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    description: "Velvety British storyteller",
  },
] as const;
