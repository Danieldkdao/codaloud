import {
  cursorCharLeft,
  cursorCharRight,
  cursorLineUp,
  cursorLineDown,
  deleteLine,
  redo,
  redoDepth,
  selectAll,
  toggleComment,
  undo,
  undoDepth,
} from "@codemirror/commands";
import {
  indentUnit,
  foldable,
  foldedRanges,
  foldEffect,
  unfoldEffect,
} from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import type {
  EditorClipboard,
  EditorCommand,
  EditorCommandState,
} from "./types";

const cursorFold = (view: EditorView) => {
  const { state } = view;
  const selection = state.selection.main;
  // Match CodeMirror’s gutter: ask for the visible line block under the cursor.
  const line = view.lineBlockAt(selection.head);
  let folded: { from: number; to: number } | undefined;
  foldedRanges(state).between(line.from, line.to, (from, to) => {
    folded ??= { from, to };
  });
  return { folded, range: folded ?? foldable(state, line.from, line.to) };
};
export const getEditorCommandState = (view: EditorView): EditorCommandState => {
  const { folded, range } = cursorFold(view);
  return {
    fold: range ? (folded ? "unfold" : "fold") : "unavailable",
    canUndo: !view.state.readOnly && undoDepth(view.state) > 0,
    canRedo: !view.state.readOnly && redoDepth(view.state) > 0,
    canComment:
      !view.state.readOnly &&
      view.state.languageDataAt("commentTokens", view.state.selection.main.head)
        .length > 0,
  };
};
export const runEditorCommand = async (
  view: EditorView,
  command: EditorCommand,
  clipboard: EditorClipboard,
  text = "",
  isActive: () => boolean = () => true,
) => {
  const state = view.state;
  const selection = state.selection;
  const current = () => {
    // Analysis and theme effects can change EditorState without changing the
    // clipboard target. Only reject edits, selection changes, or tab switches.
    if (
      !isActive() ||
      view.state.doc !== state.doc ||
      !view.state.selection.eq(selection) ||
      view.state.readOnly
    )
      throw new Error(
        "The document or selection changed. Try the command again.",
      );
  };
  if (
    state.readOnly &&
    ![
      "copy",
      "copy-line",
      "select-all",
      "fold",
      "cursor-left",
      "cursor-right",
      "cursor-up",
      "cursor-down",
    ].includes(command)
  )
    return;
  const insert = (value: string) =>
    view.dispatch({
      ...state.replaceSelection(value),
      annotations: isolateHistory.of("full"),
      userEvent: "input",
      scrollIntoView: true,
    });
  switch (command) {
    case "cursor-left":
      cursorCharLeft(view);
      break;
    case "cursor-right":
      cursorCharRight(view);
      break;
    case "cursor-up":
      cursorLineUp(view);
      break;
    case "cursor-down":
      cursorLineDown(view);
      break;
    case "tab":
      insert(state.facet(indentUnit));
      break;
    case "insert":
      insert(text);
      break;
    case "copy-line":
      await clipboard.write(state.doc.lineAt(selection.main.head).text);
      break;
    case "copy":
      await clipboard.write(
        selection.ranges
          .map((range) => state.sliceDoc(range.from, range.to))
          .join(state.lineBreak),
      );
      break;
    case "cut":
      if (selection.ranges.every((range) => range.empty)) return;
      await clipboard.write(
        selection.ranges
          .map((range) => state.sliceDoc(range.from, range.to))
          .join(state.lineBreak),
      );
      current();
      insert("");
      break;
    case "paste": {
      const value = await clipboard.read();
      current();
      insert(value);
      break;
    }
    case "delete-line":
      deleteLine(view);
      break;
    case "select-all":
      selectAll(view);
      break;
    case "comment":
      toggleComment(view);
      break;
    case "undo":
      undo(view);
      break;
    case "redo":
      redo(view);
      break;
    case "fold": {
      const { range, folded } = cursorFold(view);
      if (range)
        view.dispatch({
          effects: (folded ? unfoldEffect : foldEffect).of(range),
        });
      break;
    }
  }
};
