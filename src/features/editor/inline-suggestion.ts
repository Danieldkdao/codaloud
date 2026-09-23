import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";
import type { InlineSuggestion, InlineSuggestionAction } from "./types";

export const setInlineSuggestion =
  StateEffect.define<InlineSuggestion | null>();

class SuggestionWidget extends WidgetType {
  constructor(readonly suggestion: InlineSuggestion) {
    super();
  }
  eq = (other: SuggestionWidget) =>
    JSON.stringify(this.suggestion) === JSON.stringify(other.suggestion);
  toDOM = () => {
    const { id, text, status, transcript, from, to } = this.suggestion;
    const panel = document.createElement("span");
    panel.className = "cm-voice-suggestion";
    panel.dataset.requestId = id;
    panel.dataset.status = status;
    panel.contentEditable = "false";
    const label = document.createElement("span");
    label.className = "cm-voice-label";
    label.textContent =
      status === "listening"
        ? "Listening…"
        : status === "generating"
          ? "Writing suggestion…"
          : from === to
            ? "Suggested insertion"
            : "Suggested replacement";
    panel.append(label);
    if (transcript) {
      const words = document.createElement("span");
      words.className = "cm-voice-transcript";
      words.textContent = transcript;
      panel.append(words);
    }
    const code = document.createElement("span");
    code.className = "cm-voice-code";
    code.textContent =
      text || (status === "ready" ? "Delete selected code" : "");
    panel.append(code);
    const actions = document.createElement("span");
    actions.className = "cm-voice-actions";
    const add = (action: InlineSuggestionAction, title: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = title;
      button.setAttribute("aria-label", `${title} suggestion`);
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () =>
        panel.dispatchEvent(
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
    } else add("cancel", "Cancel");
    panel.append(actions);
    return panel;
  };
  ignoreEvent = () => true;
  updateDOM = (panel: HTMLElement) => {
    const { id, status, text, transcript } = this.suggestion;
    if (panel.dataset.requestId !== id || panel.dataset.status !== status)
      return false;
    const code = panel.querySelector<HTMLElement>(".cm-voice-code");
    const words = panel.querySelector<HTMLElement>(".cm-voice-transcript");
    if (!code || Boolean(words) !== Boolean(transcript)) return false;
    if (words) words.textContent = transcript;
    const previous = code.textContent ?? "";
    if (!text.startsWith(previous)) return false;
    if (text.length > previous.length) {
      if (code.childNodes.length > 100) code.textContent = previous;
      const added = document.createElement("span");
      added.className = "cm-voice-delta";
      added.textContent = text.slice(previous.length);
      code.append(added);
    }
    return true;
  };
}

export const inlineSuggestion = StateField.define<InlineSuggestion | null>({
  create: () => null,
  update: (value, transaction) => {
    // Even an unrelated edit invalidates the frozen revision. Undo cannot revive it.
    if (transaction.docChanged) return null;
    for (const effect of transaction.effects)
      if (effect.is(setInlineSuggestion)) value = effect.value;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => {
      if (!value) return Decoration.none;
      const marks = [];
      if (value.to > value.from)
        marks.push(
          Decoration.mark({ class: "cm-voice-original" }).range(
            value.from,
            value.to,
          ),
        );
      marks.push(
        Decoration.widget({
          widget: new SuggestionWidget(value),
          side: 1,
        }).range(value.to),
      );
      return Decoration.set(marks, true);
    }),
});

export const acceptInlineSuggestion = (view: EditorView, id: string) => {
  const suggestion = view.state.field(inlineSuggestion);
  if (
    !suggestion ||
    suggestion.id !== id ||
    suggestion.status !== "ready" ||
    view.state.readOnly
  )
    return false;
  view.dispatch({
    changes: {
      from: suggestion.from,
      to: suggestion.to,
      insert: suggestion.text,
    },
    annotations: isolateHistory.of("full"),
    selection: {
      anchor: suggestion.from + suggestion.text.replace(/\r\n/g, "\n").length,
    },
  });
  return true;
};
