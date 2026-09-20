export type EditorCommand = "insert" | "copy-line" | "delete-line" | "comment" | "fold" | "cut" | "copy" | "paste" | "select-all" | "undo" | "redo";
export type EditorCommandState = { fold: "fold" | "unfold" | "unavailable"; canUndo: boolean; canRedo: boolean; canComment: boolean };
export type EditorClipboard = { read: () => Promise<string>; write: (text: string) => Promise<unknown> };
