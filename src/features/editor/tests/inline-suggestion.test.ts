// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, redo } from "@codemirror/commands";
import {
  inlineSuggestion,
  setInlineSuggestion,
  acceptInlineSuggestion,
} from "../inline-suggestion";

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
const setup = () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "const x = 1;",
      extensions: [history(), inlineSuggestion],
    }),
  });
  views.push(view);
  return view;
};
const preview = {
  id: "one",
  from: 10,
  to: 11,
  text: "42",
  status: "generating" as const,
  transcript: "make it forty two",
};
it("streams a replacement without changing the source and accepts as one isolated undo step", () => {
  const view = setup();
  view.dispatch({ changes: { from: 0, insert: "// note\n" } });
  const suggestion = { ...preview, from: 18, to: 19 };
  view.dispatch({ effects: setInlineSuggestion.of(suggestion) });
  expect(view.state.doc.toString()).toBe("// note\nconst x = 1;");
  expect(acceptInlineSuggestion(view, "one")).toBe(false);
  view.dispatch({
    effects: setInlineSuggestion.of({ ...suggestion, status: "ready" }),
  });
  expect(acceptInlineSuggestion(view, "wrong")).toBe(false);
  expect(acceptInlineSuggestion(view, "one")).toBe(true);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 42;");
  expect(acceptInlineSuggestion(view, "one")).toBe(false);
  undo(view);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 1;");
  redo(view);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 42;");
});
it("invalidates previews on any edit, even an edit later undone", () => {
  const view = setup();
  view.dispatch({
    effects: setInlineSuggestion.of({ ...preview, status: "ready" }),
  });
  view.dispatch({ changes: { from: 0, insert: "x" } });
  undo(view);
  expect(acceptInlineSuggestion(view, "one")).toBe(false);
});
it("supports empty replacements and caret insertions and declines without an undo entry", () => {
  const view = setup();
  view.dispatch({
    effects: setInlineSuggestion.of({ ...preview, text: "", status: "ready" }),
  });
  expect(acceptInlineSuggestion(view, "one")).toBe(true);
  expect(view.state.doc.toString()).toBe("const x = ;");
  undo(view);
  view.dispatch({
    effects: setInlineSuggestion.of({
      ...preview,
      from: 12,
      to: 12,
      text: "\nnext();",
      status: "ready",
    }),
  });
  view.dispatch({ effects: setInlineSuggestion.of(null) });
  expect(view.state.doc.toString()).toBe("const x = 1;");
  expect(undo(view)).toBe(false);
});
