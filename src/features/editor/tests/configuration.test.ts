// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { insertBracket } from "@codemirror/autocomplete";
import { editorConfiguration } from "../configuration";
import { defaultEditorPreferences } from "@/features/settings/constants";
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it.each([1, 2, 4, 8])(
  "applies %s-space indentation and switches to real tab characters",
  (size) => {
    const compartment = new Compartment();
    const view = new EditorView({
      state: EditorState.create({
        doc: "text",
        extensions: [
          compartment.of(
            editorConfiguration({ ...defaultEditorPreferences, tabSize: size }),
          ),
        ],
      }),
    });
    views.push(view);
    expect(view.state.facet(indentUnit)).toBe(" ".repeat(size));
    expect(view.state.tabSize).toBe(size);
    view.dispatch({
      effects: compartment.reconfigure(
        editorConfiguration({
          ...defaultEditorPreferences,
          tabSize: size,
          useTabs: true,
        }),
      ),
    });
    expect(view.state.facet(indentUnit)).toBe("\t");
  },
);
it("disables automatic newline indentation without breaking Enter", () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "  line",
      selection: { anchor: 6 },
      extensions: [
        editorConfiguration({
          ...defaultEditorPreferences,
          keepIndentation: false,
        }),
        keymap.of(defaultKeymap),
      ],
    }),
  });
  views.push(view);
  expect(
    runScopeHandlers(
      view,
      new KeyboardEvent("keydown", { key: "Enter" }),
      "editor",
    ),
  ).toBe(true);
  expect(view.state.doc.toString()).toBe("  line\n");
});
it("retains standard automatic bracket insertion when enabled", () => {
  const state = EditorState.create({
    extensions: [editorConfiguration(defaultEditorPreferences)],
  });
  const transaction = insertBracket(state, "(");
  expect(transaction?.state.doc.toString()).toBe("()");
});
