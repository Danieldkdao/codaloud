import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import { formatCompletionIcon } from "./lib/formatters";

export const createEditorCompletionSource = (path: string, request: CodeEditorAnalysisRequest) => {
  let generation = 0;
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/[\w$]+/);
    if (!word && !context.explicit && context.state.sliceDoc(context.pos - 1, context.pos) !== ".") return null;
    const current = ++generation;
    const result = await request({ path, content: context.state.doc.toString(), position: context.pos }).catch(() => null);
    if (context.aborted || current !== generation || !result || !("completions" in result)) return null;
    const entries = result.completions.filter((entry) => (entry.from === undefined || (entry.from >= 0 && entry.from <= context.pos)) && (entry.to === undefined || (entry.to >= (entry.from ?? word?.from ?? context.pos) && entry.to <= context.state.doc.length)));
    const from = entries[0]?.from ?? word?.from ?? context.pos;
    const to = entries[0]?.to ?? context.pos;
    // A common replacement span allows CodeMirror to filter cached results as
    // the user types. Unusual per-entry spans are not reused across edits.
    const commonSpan = entries.every((entry) => (entry.from ?? from) === from && (entry.to ?? to) === to);
    return {
      from, to,
      validFor: commonSpan ? /^[\w$]*$/ : undefined,
      options: entries.map((entry) => ({
        label: entry.label, type: entry.type, detail: formatCompletionIcon(entry.type).label,
        apply: commonSpan ? entry.apply : (view, _completion, start, end) => {
          view.dispatch({ changes: { from: entry.from ?? start, to: entry.to ?? end, insert: entry.apply }, selection: { anchor: (entry.from ?? start) + entry.apply.length }, userEvent: "input.complete" });
        },
      })),
    };
  };
};
export const editorAutocompletion = (path: string, request?: CodeEditorAnalysisRequest) => autocompletion({
  override: request ? [createEditorCompletionSource(path, request)] : undefined,
  activateOnTypingDelay: 60,
  interactionDelay: 50,
  maxRenderedOptions: 30,
  aboveCursor: true,
  icons: false,
  addToOptions: [{ position: 20, render: (completion) => {
    const presentation = formatCompletionIcon(completion.type);
    const icon = document.createElement("span");
    icon.className = "cm-completion-kind";
    icon.textContent = presentation.glyph;
    icon.setAttribute("aria-label", presentation.label);
    return icon;
  } }],
});
