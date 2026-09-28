export type EditorCommand =
  | "insert"
  | "tab"
  | "cursor-left"
  | "cursor-right"
  | "cursor-up"
  | "cursor-down"
  | "copy-line"
  | "delete-line"
  | "comment"
  | "fold"
  | "cut"
  | "copy"
  | "paste"
  | "select-all"
  | "undo"
  | "redo";

export type EditorSnapshot = {
  documentKey: string;
  revision: number;
  content: string;
  from: number;
  to: number;
  focused: boolean;
};
export type InlineSuggestion = {
  id: string;
  from: number;
  to: number;
  text: string;
  transcript: string;
  status: "listening" | "generating" | "ready";
};
export type InlineSuggestionAction = "accept" | "decline" | "cancel";
export type EditorCommandState = {
  fold: "fold" | "unfold" | "unavailable";
  canUndo: boolean;
  canRedo: boolean;
  canComment: boolean;
};
export type EditorClipboard = {
  read: () => Promise<string>;
  write: (text: string) => Promise<unknown>;
};
export type EditorSearchQuery = {
  search: string;
  replace?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regexp?: boolean;
};
export type EditorSearchCommand =
  "next" | "previous" | "replace" | "replace-all";
export type EditorSearchSummary = {
  total: number;
  active: number;
  error: string | null;
};

export type EditorExplanationHighlight = Pick<
  EditorSnapshot,
  "documentKey" | "revision" | "from" | "to"
>;
export type EditorExplanationState = {
  status: "loading" | "streaming" | "ready" | "error";
  text: string;
  error?: string;
  highlight: EditorExplanationHighlight | null;
};
