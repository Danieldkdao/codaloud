// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { transformEditor } from "../transforms";
import { defaultEditorPreferences } from "@/features/settings/constants";
const views: EditorView[] = [];
const make = () => { const view = new EditorView({ state: EditorState.create({ doc: "const x=1;", extensions: [history()] }) }); views.push(view); return view; };
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it("applies one undoable transaction", async () => {
  const view = make();
  await transformEditor(view, "main.ts", "format", defaultEditorPreferences, async () => ({ edits: [{ from: 7, to: 8, insert: " = " }] }), () => true);
  expect(view.state.doc.toString()).toBe("const x = 1;"); undo(view); expect(view.state.doc.toString()).toBe("const x=1;");
});
it("rejects formatting that arrives after typing or a tab switch", async () => {
  for (const edit of [true, false]) {
    const view = make(); let resolve!: (value: { edits: {from:number;to:number;insert:string}[] }) => void;
    let active = true;
    const request = vi.fn(() => new Promise<{ edits: {from:number;to:number;insert:string}[] }>((done) => { resolve = done; }));
    const action = transformEditor(view, "main.ts", "format", defaultEditorPreferences, request, () => active);
    if (edit) view.dispatch({ changes: { from: 0, insert: "//new\n" } }); else active = false;
    resolve({ edits: [{ from: 0, to: 10, insert: "BAD" }] });
    await expect(action).rejects.toThrow(/changed/); expect(view.state.doc.toString()).not.toContain("BAD");
  }
});
it.each([[{ from: -1, to: 1, insert: "" }], [{ from: 0, to: 100, insert: "" }], [{ from: 0, to: 4, insert: "" }, { from: 2, to: 6, insert: "" }]].map((edits) => ({ edits })))("rejects invalid or overlapping edits atomically", async ({ edits }) => {
  const view = make();
  await expect(transformEditor(view, "main.ts", "format", defaultEditorPreferences, async () => ({ edits }), () => true)).rejects.toThrow();
  expect(view.state.doc.toString()).toBe("const x=1;");
});
