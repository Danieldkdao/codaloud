// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, redo } from "@codemirror/commands";
import {
  inlineSuggestion,
  acceptInlineSuggestion,
  updateInlineSuggestion,
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
it("streams syntax-highlightable document text and keeps speech out of the file", () => {
  const view = setup();
  updateInlineSuggestion(view, { ...preview, text: "", status: "listening" });
  expect(view.dom.querySelector(".cm-voice-actions")).toBeNull();
  updateInlineSuggestion(view, preview);
  expect(view.state.doc.toString()).toBe("const x = 42;");
  expect(view.dom.querySelector(".cm-voice-changed")?.textContent).toBe("42");
  expect(view.dom.textContent).not.toContain(preview.transcript);
  expect(view.dom.querySelector(".cm-voice-code")).toBeNull();
});
it("accepts a multi-chunk edit as one isolated undo step, even after moving the cursor", () => {
  const view = setup();
  view.dispatch({ changes: { from: 0, insert: "// note\n" } });
  const value = { ...preview, from: 18, to: 19 };
  updateInlineSuggestion(view, value);
  expect(acceptInlineSuggestion(view, "one")).toBe(false);
  view.dispatch({ selection: { anchor: 0 }, userEvent: "select.pointer" });
  updateInlineSuggestion(view, { ...value, text: "420", status: "ready" });
  expect(acceptInlineSuggestion(view, "wrong")).toBe(false);
  expect(acceptInlineSuggestion(view, "one")).toBe(true);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 420;");
  expect(view.dom.querySelector(".cm-voice-actions")).toBeNull();
  undo(view);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 1;");
  redo(view);
  expect(view.state.doc.toString()).toBe("// note\nconst x = 420;");
});
it("restores replacements, insertions, and deletions when declined or cancelled", () => {
  for (const value of [
    preview,
    { ...preview, from: 12, to: 12, text: "\nnext();" },
    { ...preview, text: "", status: "ready" as const },
  ]) {
    const view = setup();
    updateInlineSuggestion(view, value);
    updateInlineSuggestion(view, null);
    expect(view.state.doc.toString()).toBe("const x = 1;");
    expect(view.state.field(inlineSuggestion)).toBeNull();
  }
});
it("does not let typing overwrite an unresolved streamed edit", () => {
  const view = setup();
  updateInlineSuggestion(view, preview);
  view.dispatch({ changes: { from: 10, to: 12, insert: "oops" } });
  expect(view.state.doc.toString()).toBe("const x = 42;");
  updateInlineSuggestion(view, null);
  view.dispatch({ changes: { from: 10, to: 11, insert: "7" } });
  expect(view.state.doc.toString()).toBe("const x = 7;");
});
it("normalizes streamed CRLF offsets without corrupting the target", () => {
  const view = setup();
  updateInlineSuggestion(view, { ...preview, text: "a\r\n" });
  updateInlineSuggestion(view, { ...preview, text: "a\r\nb", status: "ready" });
  expect(view.state.doc.toString()).toBe("const x = a\nb;");
  updateInlineSuggestion(view, null);
  expect(view.state.doc.toString()).toBe("const x = 1;");
});
it("delivers real review button clicks through the editor event boundary", () => {
  const onAction = vi.fn();
  const view = new EditorView({
    state: EditorState.create({
      doc: "const x = 1;",
      extensions: [
        inlineSuggestion,
        EditorView.domEventHandlers({
          "codaloud-suggestion": (event) => {
            onAction((event as CustomEvent).detail);
            return true;
          },
        }),
      ],
    }),
  });
  views.push(view);
  updateInlineSuggestion(view, { ...preview, status: "ready" });
  view.dom.querySelector<HTMLButtonElement>("button")!.click();
  expect(onAction).toHaveBeenCalledWith({ id: "one", action: "accept" });
  view.dom.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
  expect(onAction).toHaveBeenLastCalledWith({ id: "one", action: "decline" });
});
it("keeps pending review and history intact when undo is requested before acceptance", () => {
  const view = setup();
  updateInlineSuggestion(view, { ...preview, status: "ready" });
  undo(view);
  expect(view.state.doc.toString()).toBe("const x = 42;");
  expect(acceptInlineSuggestion(view, "one")).toBe(true);
  undo(view);
  expect(view.state.doc.toString()).toBe("const x = 1;");
});
it("retargets the captured caret to a validated replacement before streaming starts", () => {
  const view = setup();
  updateInlineSuggestion(view, {
    ...preview,
    from: 12,
    to: 12,
    text: "",
    status: "generating",
  });
  updateInlineSuggestion(view, { ...preview, text: "", status: "generating" });
  updateInlineSuggestion(view, { ...preview, status: "ready" });
  expect(view.state.doc.toString()).toBe("const x = 42;");
  updateInlineSuggestion(view, null);
  expect(view.state.doc.toString()).toBe("const x = 1;");
});
