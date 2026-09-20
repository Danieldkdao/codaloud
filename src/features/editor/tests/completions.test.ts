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
