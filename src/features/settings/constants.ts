import type { EditorPreferences } from "./types";

export const editorThemes = ["Codaloud", "GitHub Light", "Solarized Light", "Rose Pine Dawn", "Quiet Light", "One Dark", "Dracula", "Nord", "Tokyo Night"] as const;
export const editorFonts = ["JetBrains Mono", "Fira Code", "Source Code Pro", "IBM Plex Mono"] as const;
export const defaultEditorPreferences: EditorPreferences = {
  theme: "Codaloud", font: "JetBrains Mono", fontSize: 16, tabSize: 2,
  wordWrap: false, lineNumbers: true, minimap: false, useTabs: false,
  keepIndentation: true, closeBrackets: true,
};
