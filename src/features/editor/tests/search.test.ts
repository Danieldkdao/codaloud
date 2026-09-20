// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import {
  editorSearch,
  updateEditorSearch,
  runSearchCommand,
  getEditorSearchSummary,
} from "../search";
const views: EditorView[] = [];
const make = (doc: string, readOnly = false) => {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [editorSearch, history(), EditorState.readOnly.of(readOnly)],
    }),
  });
  views.push(view);
  return view;
};
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it("matches case and whole words, moves both directions and wraps", () => {
  const view = make("Cat cat scatter cat");
  updateEditorSearch(view, {
    search: "cat",
    wholeWord: true,
    caseSensitive: true,
  });
  expect(getEditorSearchSummary(view).total).toBe(2);
  runSearchCommand(view, "next");
  expect(view.state.selection.main.from).toBe(4);
  runSearchCommand(view, "next");
  expect(view.state.selection.main.from).toBe(16);
  runSearchCommand(view, "next");
  expect(view.state.selection.main.from).toBe(4);
  runSearchCommand(view, "previous");
  expect(view.state.selection.main.from).toBe(16);
});
it("replaces regex capture groups in one undoable transaction", () => {
  const view = make("x1 x2 x3");
  updateEditorSearch(view, { search: "x(\\d)", regexp: true, replace: "$1x" });
  runSearchCommand(view, "replace-all");
  expect(view.state.doc.toString()).toBe("1x 2x 3x");
  undo(view);
  expect(view.state.doc.toString()).toBe("x1 x2 x3");
});
it("replaces only the selected match then advances", () => {
  const view = make("a a a");
  updateEditorSearch(view, { search: "a", replace: "b" });
  runSearchCommand(view, "next");
  runSearchCommand(view, "replace");
  expect(view.state.doc.toString()).toBe("b a a");
  expect(getEditorSearchSummary(view).total).toBe(2);
});
it.each(["[", "(", "\\"])(
  "invalid regex %s never throws or opens a desktop panel",
  (search) => {
    const view = make("test");
    updateEditorSearch(view, { search, regexp: true });
    expect(getEditorSearchSummary(view).error).toBeTruthy();
    for (const command of [
      "next",
      "previous",
      "replace",
      "replace-all",
    ] as const)
      runSearchCommand(view, command);
    expect(view.state.doc.toString()).toBe("test");
    expect(view.dom.querySelector(".cm-panels")).toBeNull();
  },
);
it("handles empty query, Unicode, multiline, and zero-width regex", () => {
  const view = make("你好\n你好");
  updateEditorSearch(view, { search: "" });
  expect(getEditorSearchSummary(view).total).toBe(0);
  updateEditorSearch(view, { search: "你好" });
  expect(getEditorSearchSummary(view).total).toBe(2);
  updateEditorSearch(view, { search: "好\n你" });
  expect(getEditorSearchSummary(view).total).toBe(1);
  updateEditorSearch(view, { search: "^", regexp: true, replace: ">" });
  runSearchCommand(view, "replace-all");
  expect(view.state.doc.toString()).toBe(">你好\n>你好");
});
it("recomputes matches after edits without modifying read-only files", () => {
  const view = make("x x", true);
  updateEditorSearch(view, { search: "x", replace: "z" });
  runSearchCommand(view, "replace-all");
  expect(view.state.doc.toString()).toBe("x x");
  view.dispatch({ changes: { from: 0, insert: "x " } });
  expect(getEditorSearchSummary(view).total).toBe(3);
});
it("handles ten thousand matches and retains correct counts on navigation", () => {
  const view = make("x ".repeat(10000));
  updateEditorSearch(view, { search: "x" });
  expect(getEditorSearchSummary(view).total).toBe(10000);
  for (let i = 0; i < 30; i++) runSearchCommand(view, "next");
  expect(getEditorSearchSummary(view).active).toBe(30);
});
