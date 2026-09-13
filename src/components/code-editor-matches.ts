import {
  EditorSelection,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import { foldedRanges, unfoldEffect } from "@codemirror/language";
import { SearchCursor } from "@codemirror/search";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export type CodeEditorMatchState = {
  total: number;
  activeIndex: number | null;
};

type MatchRange = { from: number; to: number };
type MatchDocument = {
  terms: string[];
  ranges: MatchRange[];
  decorations: DecorationSet;
  activeIndex: number | null;
};

const matchMark = Decoration.mark({ class: "cm-fileMatch" });
const activeMark = Decoration.mark({ class: "cm-fileMatch-active" });
export const setCodeEditorMatches = StateEffect.define<string[]>();
const setActiveMatch = StateEffect.define<number>();

const findMatches = (doc: Text, terms: string[]) => {
  const ranges = new Map<string, MatchRange>();
  for (const term of terms) {
    const cursor = new SearchCursor(doc, term, 0, doc.length, (text) =>
      text.toLowerCase(),
    );
    while (!cursor.next().done) {
      const { from, to, precise } = cursor.value;
      // SearchCursor also applies NFKD; keep workspace searches literal while
      // retaining its mapping back to the original document offsets.
      if (!precise || doc.sliceString(from, to).toLowerCase() !== term)
        continue;
      ranges.set(`${from}:${to}`, { from, to });
    }
  }
  return [...ranges.values()].sort((a, b) => a.from - b.from || a.to - b.to);
};

export const codeEditorMatches = StateField.define<MatchDocument>({
  create: () => ({
    terms: [],
    ranges: [],
    decorations: Decoration.none,
    activeIndex: null,
  }),
  update: (previous, transaction) => {
    let terms = previous.terms;
    let termsChanged = false;
    for (const effect of transaction.effects) {
      if (!effect.is(setCodeEditorMatches)) continue;
      const next = [
        ...new Set(
          effect.value
            .filter((term) => term.length > 0)
            .map((term) => term.toLowerCase()),
        ),
      ].sort();
      if (JSON.stringify(next) !== JSON.stringify(terms)) {
        terms = next;
        termsChanged = true;
      }
    }
    let result = previous;
    if (termsChanged || transaction.docChanged) {
      const ranges = findMatches(transaction.newDoc, terms);
      const previousRange =
        previous.activeIndex === null
          ? undefined
          : previous.ranges[previous.activeIndex];
      const mappedPosition = previousRange
        ? transaction.changes.mapPos(previousRange.from)
        : 0;
      const nextIndex = termsChanged
        ? 0
        : ranges.findIndex((range) => range.from >= mappedPosition);
      result = {
        terms,
        ranges,
        decorations: Decoration.set(
          ranges.map(({ from, to }) => matchMark.range(from, to)),
          true,
        ),
        activeIndex: ranges.length
          ? nextIndex < 0
            ? ranges.length - 1
            : nextIndex
          : null,
      };
    }
    for (const effect of transaction.effects) {
      if (effect.is(setActiveMatch) && result.ranges.length) {
        result = { ...result, activeIndex: effect.value };
      }
    }
    return result;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.decorations.from(field, ({ ranges, activeIndex }) => {
      const range = activeIndex === null ? undefined : ranges[activeIndex];
      return range
        ? Decoration.set([activeMark.range(range.from, range.to)])
        : Decoration.none;
    }),
  ],
});

export const getCodeEditorMatchState = (
  view: EditorView,
): CodeEditorMatchState => {
  const { ranges, activeIndex } = view.state.field(codeEditorMatches);
  return { total: ranges.length, activeIndex };
};

export const scrollToActiveCodeEditorMatch = (view: EditorView) => {
  const { ranges, activeIndex } = view.state.field(codeEditorMatches);
  const range = activeIndex === null ? undefined : ranges[activeIndex];
  if (!range) return;
  const effects = [
    EditorView.scrollIntoView(EditorSelection.range(range.from, range.to), {
      y: "center",
      x: "center",
    }),
  ];
  foldedRanges(view.state).between(range.from, range.to, (from, to) => {
    if (from < range.to && to > range.from)
      effects.push(unfoldEffect.of({ from, to }));
  });
  view.dispatch({ effects });
};

export const moveCodeEditorMatch = (view: EditorView, direction: -1 | 1) => {
  const { ranges, activeIndex } = view.state.field(codeEditorMatches);
  if (!ranges.length) return;
  const index =
    ((activeIndex ?? 0) + direction + ranges.length) % ranges.length;
  // Decorations keep navigation separate from the edit selection and keyboard focus.
  view.dispatch({ effects: setActiveMatch.of(index) });
  scrollToActiveCodeEditorMatch(view);
};
