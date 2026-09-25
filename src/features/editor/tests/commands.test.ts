// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defaultKeymap, history, undo } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import { codeFolding, ensureSyntaxTree, indentUnit } from "@codemirror/language";
import { runEditorCommand, getEditorCommandState } from "../commands";
const views: EditorView[] = [];
const make = async (doc = "one\ntwo\nthree", readOnly = false) => {
  const language = await languages
    .find((item) => item.name === "JavaScript")!
    .load();
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        codeFolding(),
        language,
        EditorState.readOnly.of(readOnly),
      ],
    }),
  });
  views.push(view);
  return view;
};
const clipboard = () => ({
  read: vi.fn().mockResolvedValue("paste"),
  write: vi.fn().mockResolvedValue(undefined),
});
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it("inserts symbols over selection and supports undo and redo", async () => {
  const view = await make();
  view.dispatch({ selection: { anchor: 0, head: 3 } });
  await runEditorCommand(view, "insert", clipboard(), "{}");
  expect(view.state.doc.toString()).toBe("{}\ntwo\nthree");
  await runEditorCommand(view, "undo", clipboard());
  expect(view.state.doc.toString()).toBe("one\ntwo\nthree");
  await runEditorCommand(view, "redo", clipboard());
  expect(view.state.doc.toString()).toBe("{}\ntwo\nthree");
});
it.each([0, 5, 10])(
  "copies and deletes the current line at %s, including last line",
  async (position) => {
    const view = await make();
    const disk = clipboard();
    view.dispatch({ selection: { anchor: position } });
    const line = view.state.doc.lineAt(position).text;
    await runEditorCommand(view, "copy-line", disk);
    expect(disk.write).toHaveBeenCalledWith(line);
    await runEditorCommand(view, "delete-line", disk);
    expect(view.state.doc.toString().split("\n")).not.toContain(line);
    undo(view);
    expect(view.state.doc.toString()).toBe("one\ntwo\nthree");
  },
);
it("preserves the original until a cut reaches the clipboard", async () => {
  const view = await make("hello");
  const disk = clipboard();
  view.dispatch({ selection: { anchor: 0, head: 5 } });
  disk.write.mockRejectedValue(new Error("denied"));
  await expect(runEditorCommand(view, "cut", disk)).rejects.toThrow("denied");
  expect(view.state.doc.toString()).toBe("hello");
});
it.each(["paste", "cut"] as const)(
  "rejects delayed %s after newer edits or selection",
  async (command) => {
    const view = await make("hello");
    const disk = clipboard();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    let done!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      done = resolve;
    });
    disk.read.mockReturnValue(promise);
    disk.write.mockReturnValue(promise);
    const action = runEditorCommand(view, command, disk);
    view.dispatch({ changes: { from: 0, insert: "new " } });
    done("paste");
    await expect(action).rejects.toThrow(/changed/);
    expect(view.state.doc.toString()).toBe("new hello");
  },
);
it("keeps read-only documents unchanged for every mutating command", async () => {
  const view = await make("hello", true);
  for (const command of [
    "insert",
    "tab",
    "cut",
    "paste",
    "delete-line",
    "comment",
    "undo",
    "redo",
  ] as const)
    await runEditorCommand(view, command, clipboard(), "bad");
  expect(view.state.doc.toString()).toBe("hello");
});
it("toggles comments and leaves strings intact", async () => {
  const view = await make('const url = "https://example.com";\nconst n = 1;');
  await runEditorCommand(view, "select-all", clipboard());
  await runEditorCommand(view, "comment", clipboard());
  expect(view.state.doc.line(1).text.startsWith("//")).toBe(true);
  await runEditorCommand(view, "comment", clipboard());
  expect(view.state.doc.line(1).text).toBe(
    'const url = "https://example.com";',
  );
});
it("only toggles folds whose start line is selected", async () => {
  const view = await make("function hello() {\n  return 1;\n}\nconst x = 2;");
  ensureSyntaxTree(view.state, view.state.doc.length, 1000);
  view.dispatch({ selection: { anchor: 22, head: 27 } });
  expect(getEditorCommandState(view).fold).toBe("unavailable");
  view.dispatch({ selection: { anchor: 0, head: 18 } });
  expect(getEditorCommandState(view).fold).toBe("fold");
  await runEditorCommand(view, "fold", clipboard());
  expect(getEditorCommandState(view).fold).toBe("unfold");
  await runEditorCommand(view, "fold", clipboard());
  expect(getEditorCommandState(view).fold).toBe("fold");
});

it("does not reject clipboard operations because a non-editing editor effect ran", async () => {
  const { StateEffect } = await import("@codemirror/state");
  const view = await make("hello");
  const disk = clipboard();
  let done!: (value: string) => void;
  disk.read.mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  const action = runEditorCommand(view, "paste", disk);
  view.dispatch({ effects: StateEffect.define<boolean>().of(true) });
  done("new");
  await action;
  expect(view.state.doc.toString()).toBe("newhello");
});

it("uses the cursor line, including backward selections, just like the fold gutter", async () => {
  const view = await make("function hello() {\n  return 1;\n}\nconst x = 2;");
  ensureSyntaxTree(view.state, view.state.doc.length, 1000);
  view.dispatch({ selection: { anchor: 25, head: 4 } });
  expect(getEditorCommandState(view).fold).toBe("fold");
  view.dispatch({ selection: { anchor: 4, head: 25 } });
  expect(getEditorCommandState(view).fold).toBe("unavailable");
  view.dispatch({ selection: { anchor: 7 } });
  await runEditorCommand(view, "fold", clipboard());
  expect(getEditorCommandState(view).fold).toBe("unfold");
});

it("moves across characters, emoji, and line breaks without editing text", async () => {
  const view = await make("a👋\nb");
  for (const position of [1, 3, 4, 5, 5]) {
    await runEditorCommand(view, "cursor-right", clipboard());
    expect(view.state.selection.main.head).toBe(position);
  }
  for (const position of [4, 3, 1, 0, 0]) {
    await runEditorCommand(view, "cursor-left", clipboard());
    expect(view.state.selection.main.head).toBe(position);
  }
  expect(view.state.doc.toString()).toBe("a👋\nb");
  expect(getEditorCommandState(view).canUndo).toBe(false);
});

it.each([true, false])("collapses selections with arrow keys, readOnly=%s", async (readOnly) => {
  const view = await make("hello world", readOnly);
  for (const [command, expected] of [["cursor-left", 1], ["cursor-right", 8], ["cursor-up", 1], ["cursor-down", 8]] as const) {
    view.dispatch({ selection: { anchor: 8, head: 1 } });
    await runEditorCommand(view, command, clipboard());
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(expected);
  }
});

it("matches standard vertical arrow-key navigation through uneven lines", async () => {
  const view = await make("abcdef\nx\nabcdef");
  const keyboard = await make("abcdef\nx\nabcdef");
  for (const editor of [view, keyboard]) editor.dispatch({ selection: { anchor: 5 } });
  // This DOM harness has no physical line geometry. Compare with the real
  // keyboard commands so goal-column and boundary semantics stay library-owned.
  for (const [command, key] of [["cursor-down", "ArrowDown"], ["cursor-down", "ArrowDown"], ["cursor-up", "ArrowUp"], ["cursor-up", "ArrowUp"]] as const) {
    defaultKeymap.find((binding) => binding.key === key)!.run!(keyboard);
    await runEditorCommand(view, command, clipboard());
    expect(view.state.selection.eq(keyboard.state.selection, true)).toBe(true);
  }
  expect(view.state.doc.toString()).toBe("abcdef\nx\nabcdef");
});

it.each(["  ", "    ", "\t"])("inserts the configured indentation unit %j at the caret and can undo it", async (unit) => {
  const view = new EditorView({ state: EditorState.create({
    doc: "hello", selection: { anchor: 2 }, extensions: [history(), indentUnit.of(unit)],
  }) });
  views.push(view);
  await runEditorCommand(view, "tab", clipboard());
  expect(view.state.doc.toString()).toBe(`he${unit}llo`);
  expect(view.state.selection.main.head).toBe(2 + unit.length);
  undo(view);
  expect(view.state.doc.toString()).toBe("hello");
});
