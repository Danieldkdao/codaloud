import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export const setExplanationHighlight = StateEffect.define<{
  from: number;
  to: number;
} | null>();
export const explanationHighlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    // Explanations describe a frozen revision, so editing invalidates the highlight.
    if (transaction.docChanged) return Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(setExplanationHighlight)) continue;
      const range = effect.value;
      value =
        range &&
        Number.isInteger(range.from) &&
        Number.isInteger(range.to) &&
        range.from >= 0 &&
        range.to > range.from &&
        range.to <= transaction.newDoc.length
          ? Decoration.set([
              Decoration.mark({ class: "cm-explanation-highlight" }).range(
                range.from,
                range.to,
              ),
            ])
          : Decoration.none;
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
