// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { createEditorCompletionSource } from "../completions";
it("returns typed local completions with reusable prefix results", async () => {
  const state = EditorState.create({ doc: "value.to" });
  const source = createEditorCompletionSource("main.ts", async () => ({
    completions: [{ label: "toString", apply: "toString", type: "function" }],
  }));
  const result = await source(new CompletionContext(state, 8, false));
  expect(result).toMatchObject({
    from: 6,
    options: [{ label: "toString", type: "function" }],
  });
  expect(result?.validFor).toBeInstanceOf(RegExp);
});
it("does not request suggestions on whitespace unless explicitly requested", async () => {
  const request = vi.fn();
  const state = EditorState.create({ doc: "   " });
  const source = createEditorCompletionSource("main.ts", request);
  expect(await source(new CompletionContext(state, 3, false))).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
it("discards superseded requests and filters out-of-bounds replacement spans", async () => {
  let done!: (value: {
    completions: { label: string; apply: string; type: string }[];
  }) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    )
    .mockResolvedValue({
      completions: [
        { label: "bad", apply: "bad", type: "variable", from: 0, to: 100 },
      ],
    });
  const source = createEditorCompletionSource("main.ts", request);
  const first = source(
    new CompletionContext(EditorState.create({ doc: "x.a" }), 3, false),
  );
  const second = await source(
    new CompletionContext(EditorState.create({ doc: "x.ab" }), 4, false),
  );
  done({ completions: [{ label: "old", apply: "old", type: "variable" }] });
  expect(await first).toBeNull();
  expect(second?.options ?? []).toHaveLength(0);
});
it("treats service failure as unavailable suggestions without rejecting", async () => {
  const source = createEditorCompletionSource("main.ts", async () => {
    throw new Error("failed");
  });
  expect(
    await source(
      new CompletionContext(EditorState.create({ doc: "a." }), 2, false),
    ),
  ).toBeNull();
});

it.each(['import {  } from "./helpers";', 'import { x } from "./";', 'const x = import("./");'])("requests suggestions inside import contexts: %s", async (doc) => {
  const request = vi.fn().mockResolvedValue({ completions: [] });
  const pos = doc.includes('{  }') ? 9 : doc.indexOf('./') + 2;
  await createEditorCompletionSource("main.ts", request)(new CompletionContext(EditorState.create({ doc }), pos, false));
  expect(request).toHaveBeenCalledOnce();
});

it("makes every scoped package reachable in the touch-scrollable suggestion list", async () => {
  const { EditorView } = await import("@codemirror/view");
  const { startCompletion } = await import("@codemirror/autocomplete");
  const { editorAutocompletion } = await import("../completions");
  const doc = 'import x from "@';
  const names = Array.from({ length: 120 }, (_, index) => `@scope/package-${String(index).padStart(3, "0")}`);
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({ parent, state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [
    editorAutocompletion("main.ts", async () => ({ completions: names.map((name) => ({ label: name, apply: name, type: "namespace", from: doc.length - 1, to: doc.length })) })),
  ] }) });
  try {
    view.focus();
    startCompletion(view);
    await vi.waitFor(() => expect(parent.querySelectorAll(".cm-tooltip-autocomplete li")).toHaveLength(names.length));
    const last = parent.querySelectorAll(".cm-tooltip-autocomplete li")[119];
    last.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toBe('import x from "@scope/package-119');
  } finally { view.destroy(); parent.remove(); }
});
