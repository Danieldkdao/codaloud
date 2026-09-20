// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import { codeFolding, ensureSyntaxTree } from "@codemirror/language";
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
