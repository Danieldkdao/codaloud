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
      view.dom.querySelectorAll(".cm-minimap text").length,
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

it("renders actual code glyphs with syntax highlighting instead of solid bars", async () => {
  const { languages } = await import("@codemirror/language-data");
  const { syntaxHighlighting, defaultHighlightStyle } = await import("@codemirror/language");
  const javascript = await languages.find((item) => item.name === "JavaScript")!.load();
  const view = new EditorView({ state: EditorState.create({ doc: 'const name = "hello";\nfunction greet() { return name; }', extensions: [javascript, syntaxHighlighting(defaultHighlightStyle), editorMinimap] }) });
  try {
    expect(view.dom.querySelector(".cm-minimap text")?.textContent).toContain('const name = "hello";');
    expect(view.dom.querySelectorAll(".cm-minimap tspan[class]").length).toBeGreaterThan(1);
  } finally { view.destroy(); }
});

it("keeps short files compact and includes the final line when sampling long files", () => {
  const view = new EditorView({ state: EditorState.create({ doc: "first\nlast", extensions: [editorMinimap] }) });
  try {
    expect(view.dom.querySelector(".cm-minimap-content")?.getAttribute("style")).toContain("height: 4px");
    expect(view.dom.querySelector(".cm-minimap svg")?.getAttribute("viewBox")).toBe("0 0 180 12");
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "line\n".repeat(20000) + "finalLine" } });
    expect(view.dom.querySelector(".cm-minimap text:last-child")?.textContent).toBe("finalLine");
  } finally { view.destroy(); }
});
