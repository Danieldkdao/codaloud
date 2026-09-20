import type { EditorTheme, EditorFont } from "@/features/settings/types";

export const formatEditorAppearance = (theme: EditorTheme): "light" | "dark" | null => {
  switch (theme) {
    case "Codaloud": return null;
    case "GitHub Light": case "Solarized Light": case "Rose Pine Dawn": case "Quiet Light": return "light";
    case "One Dark": case "Dracula": case "Nord": case "Tokyo Night": return "dark";
  }
};
export const formatEditorThemeClass = (theme: EditorTheme) => {
  switch (theme) {
    case "Codaloud": return "";
    case "GitHub Light": return "editor-github-light";
    case "Solarized Light": return "editor-solarized-light";
    case "Rose Pine Dawn": return "editor-rose-pine-dawn";
    case "Quiet Light": return "editor-quiet-light";
    case "One Dark": return "editor-one-dark";
    case "Dracula": return "editor-dracula";
    case "Nord": return "editor-nord";
    case "Tokyo Night": return "editor-tokyo-night";
  }
};
export const formatEditorFontFamily = (font: EditorFont) => {
  switch (font) {
    case "JetBrains Mono": return "JetBrainsMono";
    case "Fira Code": return "FiraCode";
    case "Source Code Pro": return "SourceCodePro";
    case "IBM Plex Mono": return "IBMPlexMono";
  }
};

export const formatEditorSearchSummary = (summary?: import("../types").EditorSearchSummary) =>
  summary?.error ?? (summary ? `${summary.active} / ${summary.total}` : "Searching…");
