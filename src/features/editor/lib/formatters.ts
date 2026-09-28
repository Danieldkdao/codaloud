import type { EditorTheme, EditorFont } from "@/features/settings/types";

/** Markdown is rendered visually, but read aloud it should be plain prose. */
export const toSpeakableText = (markdown: string) => {
  const prose = markdown
    // Fenced and inline code are source, not something to narrate.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*([-*_])\s*(?:\1\s*){2,}$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  return prose;
};

/** Split prose into speakable sentences so speech can start before the stream ends. */
export const toSpeechSentences = (markdown: string, limit = 300) => {
  const prose = toSpeakableText(markdown);
  if (!prose) return [];
  // Keep the terminator with its sentence so the voice lands correctly.
  const sentences = prose.match(/[^.!?]+[.!?]+[\s"')\]]*|[^.!?]+$/g) ?? [];
  return sentences
    .flatMap((sentence) => {
      const trimmed = sentence.trim();
      if (trimmed.length <= limit) return trimmed ? [trimmed] : [];
      // A sentence with no punctuation can still be arbitrarily long.
      const parts: string[] = [];
      for (let start = 0; start < trimmed.length; start += limit)
        parts.push(trimmed.slice(start, start + limit).trim());
      return parts.filter(Boolean);
    })
    .filter(Boolean);
};

export const formatEditorAppearance = (
  theme: EditorTheme,
): "light" | "dark" | null => {
  switch (theme) {
    case "Codaloud":
      return null;
    case "GitHub Light":
    case "Solarized Light":
    case "Rose Pine Dawn":
    case "Quiet Light":
      return "light";
    case "One Dark":
    case "Dracula":
    case "GitHub Dark":
    case "Tokyo Night":
      return "dark";
  }
};
export const formatEditorThemeClass = (theme: EditorTheme) => {
  switch (theme) {
    case "Codaloud":
      return "";
    case "GitHub Light":
      return "editor-github-light";
    case "Solarized Light":
      return "editor-solarized-light";
    case "Rose Pine Dawn":
      return "editor-rose-pine-dawn";
    case "Quiet Light":
      return "editor-quiet-light";
    case "One Dark":
      return "editor-one-dark";
    case "Dracula":
      return "editor-dracula";
    case "GitHub Dark":
      return "editor-github-dark";
    case "Tokyo Night":
      return "editor-tokyo-night";
  }
};
export const formatEditorFontFamily = (font: EditorFont) => {
  switch (font) {
    case "JetBrains Mono":
      return "JetBrainsMono";
    case "Fira Code":
      return "FiraCode";
    case "Source Code Pro":
      return "SourceCodePro";
    case "IBM Plex Mono":
      return "IBMPlexMono";
  }
};

export const formatEditorSearchSummary = (
  summary?: import("../types").EditorSearchSummary,
) =>
  summary?.error ??
  (summary ? `${summary.active} / ${summary.total}` : "Searching…");

export const formatInlineDiagnosticClass = (severity: string) => {
  switch (severity) {
    case "error":
      return "cm-inline-diagnostic cm-inline-error";
    case "warning":
      return "cm-inline-diagnostic cm-inline-warning";
    default:
      return "cm-inline-diagnostic cm-inline-info";
  }
};
export const formatDiagnosticLineClass = (severity: string) => {
  switch (severity) {
    case "error":
      return "cm-diagnostic-line-error";
    case "warning":
      return "cm-diagnostic-line-warning";
    default:
      return "cm-diagnostic-line-info";
  }
};
export const formatCompletionIcon = (type?: string) => {
  switch (type) {
    case "function":
    case "method":
      return { glyph: "ƒ", label: "Function" };
    case "class":
      return { glyph: "◇", label: "Class" };
    case "type":
    case "interface":
      return { glyph: "T", label: "Type" };
    case "constant":
      return { glyph: "π", label: "Constant" };
    case "property":
      return { glyph: "▪", label: "Property" };
    case "keyword":
      return { glyph: "⌘", label: "Keyword" };
    case "file":
      return { glyph: "▤", label: "File" };
    case "namespace":
      return { glyph: "▣", label: "Namespace" };
    default:
      return { glyph: "𝑥", label: "Variable" };
  }
};

export const formatSuppressedAnalysisNotice = (count: number) =>
  `Showing ${count} syntax ${count === 1 ? "error" : "errors"}. This file does not parse, so every other check was skipped. Fix the syntax errors to see the warnings and suggestions for the rest of the file.`;

export const formatProblemFilter = (
  severity:
    | import("@/features/projects/actions/code-intelligence-schemas").DiagnosticSeverity
    | "all",
) => {
  switch (severity) {
    case "all":
      return "All";
    case "error":
      return "Errors";
    case "warning":
      return "Warnings";
    case "info":
      return "Info";
  }
};
export const formatProblemLocation = (item: {
  code: string;
  source: string;
  line?: number;
  column?: number;
}) =>
  item.line
    ? `Line ${item.line}, column ${item.column ?? 1} · ${item.source} ${item.code}`
    : `${item.source} ${item.code}`;

export const formatNativeEditorFontClass = (font: EditorFont) => {
  switch (font) {
    case "JetBrains Mono":
      return "code-font-jetbrains";
    case "Fira Code":
      return "code-font-fira";
    case "Source Code Pro":
      return "code-font-source";
    case "IBM Plex Mono":
      return "code-font-plex";
  }
};

export const formatProblemAccent = (
  severity: import("@/features/projects/actions/code-intelligence-schemas").DiagnosticSeverity,
) => {
  switch (severity) {
    case "error":
      return { background: "bg-destructive/10", text: "text-destructive" };
    case "warning":
      return { background: "bg-warning/10", text: "text-warning" };
    case "info":
      return { background: "bg-info/10", text: "text-info" };
  }
};
