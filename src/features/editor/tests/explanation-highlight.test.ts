import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import {
  explanationHighlight,
  setExplanationHighlight,
} from "../explanation-highlight";
it("keeps a decoration independently of selection and clears it on close or edit", () => {
  let state = EditorState.create({
    doc: "const x = 1;",
    extensions: [explanationHighlight],
  });
  state = state.update({
    effects: setExplanationHighlight.of({ from: 6, to: 7 }),
  }).state;
  state = state.update({ selection: { anchor: 0 } }).state;
  expect(state.field(explanationHighlight).size).toBe(1);
  expect(state.doc.toString()).toBe("const x = 1;");
  const cleared = state.update({
    effects: setExplanationHighlight.of(null),
  }).state;
  expect(cleared.field(explanationHighlight).size).toBe(0);
  expect(
    state
      .update({ changes: { from: 0, insert: "//" } })
      .state.field(explanationHighlight).size,
  ).toBe(0);
});
it("ignores invalid or empty ranges", () => {
  const state = EditorState.create({
    doc: "a",
    extensions: [explanationHighlight],
  });
  for (const range of [
    { from: 0, to: 4 },
    { from: 0, to: 0 },
    { from: -1, to: 1 },
  ])
    expect(
      state
        .update({ effects: setExplanationHighlight.of(range) })
        .state.field(explanationHighlight).size,
    ).toBe(0);
});
