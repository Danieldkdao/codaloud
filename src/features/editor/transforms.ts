import { isolateHistory } from "@codemirror/commands";
import { indentRange, language } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import type { CodeIntelligenceOperation } from "@/features/projects/actions/code-intelligence-schemas";
import { CODE_INTELLIGENCE_FILE_PATTERN } from "@/features/projects/constants";
import type { EditorPreferences } from "@/features/settings/types";

export const transformEditor = async (view: EditorView, path: string, operation: CodeIntelligenceOperation, preferences: EditorPreferences, request: CodeEditorAnalysisRequest, isActive: () => boolean) => {
  if (view.state.readOnly) return;
  const doc = view.state.doc;
  if (!CODE_INTELLIGENCE_FILE_PATTERN.test(path)) {
    if (operation === "organize-imports") throw new Error("Import organization is available for JavaScript and TypeScript files.");
    if (!view.state.facet(language)) throw new Error("Formatting is unavailable for this file type.");
    view.dispatch({ changes: indentRange(view.state, 0, doc.length), annotations: isolateHistory.of("full"), userEvent: "input.format" });
    return;
  }
  const result = await request({ path, content: doc.toString(), operation, tabSize: preferences.tabSize, useTabs: preferences.useTabs });
  if (!isActive() || view.state.doc !== doc || view.state.readOnly) throw new Error("The document changed while preparing this action. Try again.");
  if (!result || !("edits" in result)) throw new Error("Couldn’t prepare this edit. Try again.");
  const edits = [...result.edits].sort((a, b) => a.from - b.from || a.to - b.to);
  let end = 0;
  for (const edit of edits) {
    if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < end || edit.to < edit.from || edit.to > doc.length) throw new Error("The language service returned invalid edits.");
    end = edit.to;
  }
  if (edits.length) view.dispatch({ changes: edits, annotations: isolateHistory.of("full"), userEvent: "input.format" });
};
