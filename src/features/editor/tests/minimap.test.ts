// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorMinimap } from "../minimap";
it("bounds the overview size for large files, navigates, and removes cleanly", () => {
  const compartment = new Compartment();
  const view = new EditorView({
    state: EditorState.create({
      doc: "  value\n".repeat(20000),
      extensions: [compartment.of(editorMinimap)],
    }),
  });
  try {
    expect(
      view.dom.querySelectorAll(".cm-minimap rect").length,
    ).toBeLessThanOrEqual(600);
    const slider =
      view.dom.querySelector<HTMLInputElement>(".cm-minimap input")!;
    expect(slider).not.toBeNull();
    slider.value = "100";
    slider.dispatchEvent(new Event("input"));
    expect(view.state.selection.main.head).toBeGreaterThan(100000);
    view.dispatch({ effects: compartment.reconfigure([]) });
    expect(view.dom.querySelector(".cm-minimap")).toBeNull();
  } finally {
    view.destroy();
  }
});
