export type EditorCommand =
  | "insert"
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
