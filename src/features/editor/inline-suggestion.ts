import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";
import type { InlineSuggestion, InlineSuggestionAction } from "./types";

type StreamedSuggestion = InlineSuggestion & {
  original: string;
  end: number;
  started: boolean;
};

const setInlineSuggestion = StateEffect.define<StreamedSuggestion | null>();

class SuggestionWidget extends WidgetType {
  constructor(readonly suggestion: StreamedSuggestion) {
    super();
  }
  eq = (other: SuggestionWidget) =>
    this.suggestion.id === other.suggestion.id &&
    this.suggestion.status === other.suggestion.status &&
    this.suggestion.text === other.suggestion.text;
  toDOM = () => {
    const { id, status } = this.suggestion;
    const actions = document.createElement("span");
    actions.className = "cm-voice-actions";
    actions.contentEditable = "false";
    const deletion =
      this.suggestion.started && this.suggestion.end === this.suggestion.from;
    actions.dataset.deletion = String(deletion);
    actions.setAttribute(
      "aria-label",
      deletion ? "Review deleted code" : "Review inline edit",
    );
    const add = (action: InlineSuggestionAction, title: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = title;
      button.setAttribute("aria-label", `${title} suggestion`);
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () =>
        actions.dispatchEvent(
          new CustomEvent("codaloud-suggestion", {
            bubbles: true,
            detail: { id, action },
          }),
        );
      actions.append(button);
    };
    if (status === "ready") {
      add("accept", "Accept");
      add("decline", "Decline");
    } else {
      const label = document.createElement("span");
      label.textContent = "Writing…";
      actions.append(label);
      add("cancel", "Cancel");
    }
    return actions;
  };
  // Let the review event reach CodeMirror's handler; native pointer events
  // still belong to the buttons rather than the editor's selection logic.
  ignoreEvent = (event: Event) => event.type !== "codaloud-suggestion";
}

export const inlineSuggestion = StateField.define<StreamedSuggestion | null>({
  create: () => null,
  update: (value, transaction) => {
    for (const effect of transaction.effects)
      if (effect.is(setInlineSuggestion)) return effect.value;
    return transaction.docChanged ? null : value;
  },
  provide: (field) => [
    Prec.highest(
      EditorState.readOnly.computeN([field], (state) => {
        const value = state.field(field);
        return value && value.status !== "listening" ? [true] : [];
      }),
    ),
    // A pending replacement must remain reversible, including during native
    // callback round trips. Selection and scrolling remain available.
    EditorState.changeFilter.of((transaction) => {
      const value = transaction.startState.field(field);
      return !value || value.status === "listening";
    }),
    EditorView.decorations.compute([field], (state) => {
      const value = state.field(field);
      if (!value || value.status === "listening") return Decoration.none;
      const marks = [];
      if (value.started && value.end > value.from)
        marks.push(
          Decoration.mark({ class: "cm-voice-changed" }).range(
            value.from,
            value.end,
          ),
        );
      marks.push(
        Decoration.widget({
          widget: new SuggestionWidget(value),
          side: 1,
          block: true,
        }).range(state.doc.lineAt(value.end).to),
      );
      return Decoration.set(marks, true);
    }),
  ],
});

export const updateInlineSuggestion = (
  view: EditorView,
  value: InlineSuggestion | null,
) => {
  let current = view.state.field(inlineSuggestion);
  if (!value) {
    if (!current) return;
    view.dispatch({
      changes: current?.started
        ? { from: current.from, to: current.end, insert: current.original }
        : undefined,
      effects: setInlineSuggestion.of(null),
      annotations: isolateHistory.of("full"),
      filter: false,
    });
    return;
  }
  if (view.state.readOnly && (!current || current.status === "listening"))
    return;
  if (current && current.id !== value.id) return;
  if (current && (current.from !== value.from || current.to !== value.to)) {
    if (current.started) return;
    // The structured response can choose a replacement near the frozen caret.
    // Capture that range before the first code chunk so Decline restores it.
    current = null;
  }
  if (
    !current &&
    (value.from < 0 ||
      value.to < value.from ||
      value.to > view.state.doc.length)
  )
    return;
  const text = view.state.toText(value.text);
  const started = Boolean(
    current?.started || value.text || value.status === "ready",
  );
  const end = current?.end ?? value.to;
  const changed =
    started &&
    (!current?.started ||
      view.state.doc.sliceString(value.from, end) !== text.toString());
  view.dispatch({
    changes: changed ? { from: value.from, to: end, insert: text } : undefined,
    effects: setInlineSuggestion.of({
      ...value,
      original: current?.original ?? view.state.sliceDoc(value.from, value.to),
      end: started ? value.from + text.length : value.to,
      started,
    }),
    // Treat a streamed edit as a single composition, regardless of chunk delays
    // or selection movements. Keep it separate from earlier and later typing.
    userEvent: current?.started
      ? "input.type.compose"
      : "input.type.compose.start",
    annotations: current?.started ? [] : isolateHistory.of("before"),
    filter: false,
  });
};

export const acceptInlineSuggestion = (view: EditorView, id: string) => {
  const value = view.state.field(inlineSuggestion);
  if (!value || value.id !== id || value.status !== "ready") return false;
  view.dispatch({
    effects: setInlineSuggestion.of(null),
    annotations: isolateHistory.of("after"),
  });
  return true;
};
