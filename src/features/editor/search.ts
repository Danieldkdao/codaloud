import { StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, search, SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorSearchCommand, EditorSearchQuery, EditorSearchSummary } from "./types";

const matches = StateField.define<{ ranges: { from: number; to: number }[]; decorations: ReturnType<typeof Decoration.set> }>({
  create: () => ({ ranges: [], decorations: Decoration.none }),
  update: (value, transaction) => {
    if (!transaction.docChanged && !transaction.effects.some((effect) => effect.is(setSearchQuery))) return value;
    const query = getSearchQuery(transaction.state);
    const ranges: { from: number; to: number }[] = [];
    if (query.valid) {
      const cursor = query.getCursor(transaction.state);
      for (let next = cursor.next(); !next.done; next = cursor.next()) ranges.push(next.value);
    }
    return { ranges, decorations: Decoration.set(ranges.filter((range) => range.from < range.to).map(({ from, to }) => Decoration.mark({ class: "cm-fileMatch" }).range(from, to)), true) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});
export const editorSearch = [search(), matches];
export const updateEditorSearch = (view: EditorView, query: EditorSearchQuery) => {
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...query, literal: !query.regexp })) });
};
export const getEditorSearchSummary = (view: EditorView): EditorSearchSummary => {
  const query = getSearchQuery(view.state);
  const { ranges } = view.state.field(matches);
  const selection = view.state.selection.main;
  return { total: ranges.length, active: ranges.findIndex((range) => range.from === selection.from && range.to === selection.to) + 1, error: query.search && !query.valid ? "Invalid regular expression" : null };
};
export const runSearchCommand = (view: EditorView, command: EditorSearchCommand) => {
  // Invalid/empty queries must never open CodeMirror’s desktop panel.
  if (!getSearchQuery(view.state).valid) return;
  switch (command) {
    case "next": findNext(view); break;
    case "previous": findPrevious(view); break;
    case "replace": replaceNext(view); break;
    case "replace-all": replaceAll(view); break;
  }
};
