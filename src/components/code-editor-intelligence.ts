import {
  autocompletion,
  insertCompletionText,
  type Completion,
} from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import type { EditorView } from "codemirror";
import { StateEffect } from "@codemirror/state";
import type {
  CodeDiagnosticSchema,
  CodeIntelligenceRequestSchema,
  CodeIntelligenceResultSchema,
} from "@/features/projects/actions/code-intelligence-schemas";

export type CodeEditorAnalysis = {
  status: "checking" | "ready" | "unavailable" | "unsupported";
  diagnostics: CodeDiagnosticSchema[];
};
export type CodeEditorAnalysisRequest = (
  input: CodeIntelligenceRequestSchema,
) => Promise<CodeIntelligenceResultSchema | null>;
export const refreshCodeAnalysis = StateEffect.define<null>();

export const createCodeEditorIntelligence = (
  filename: string,
  request: CodeEditorAnalysisRequest,
  onAnalysis: (analysis: CodeEditorAnalysis) => void,
) => {
  let active = true;
  let generation = 0;
  let hasAnalysis = false;
  let pending = Promise.resolve();
  const analyze = async (
    input: CodeIntelligenceRequestSchema,
    isCurrent: () => boolean,
  ) => {
    const previous = pending;
    let release!: () => void;
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      // Keep one analysis in flight per editor. Skip superseded requests before
      // crossing the DOM/native boundary and doing compiler work.
      if (!active || !isCurrent()) return null;
      return await request(input).catch(() => null);
    } finally {
      release();
    }
  };
  const extensions = [
    linter(
      async (view) => {
        const doc = view.state.doc;
        const current = ++generation;
        if (!hasAnalysis) onAnalysis({ status: "checking", diagnostics: [] });
        const result = await analyze(
          { path: filename, content: doc.toString() },
          () => view.state.doc === doc && current === generation,
        );
        if (!active || view.state.doc !== doc || current !== generation)
          return [];
        if (!result || !("diagnostics" in result)) {
          onAnalysis({ status: "unavailable", diagnostics: [] });
          return [];
        }
        const diagnostics = result.diagnostics.filter(
          (item) => item.from <= item.to && item.to <= doc.length,
        );
        hasAnalysis = true;
        onAnalysis({ status: "ready", diagnostics });
        return diagnostics.map((item) => ({
          ...item,
          source: `TS${item.code}`,
        }));
      },
      {
        delay: 150,
        needsRefresh: (update) =>
          (update.focusChanged && update.view.hasFocus) ||
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) =>
              effect.is(refreshCodeAnalysis),
            ),
          ),
      },
    ),
    autocompletion({
      activateOnTypingDelay: 100,
      override: [
        async (context) => {
          // Snapshot offsets must never be applied to text typed during the request.
          context.addEventListener("abort", () => {}, { onDocChange: true });
          const result = await analyze(
            {
              path: filename,
              content: context.state.doc.toString(),
              position: context.pos,
            },
            () => !context.aborted,
          );
          if (
            !active ||
            context.aborted ||
            !result ||
            !("completions" in result)
          )
            return null;
          const word = context.matchBefore(/[\w$]*/);
          const options: Completion[] = result.completions
            .filter(
              (item) =>
                item.from === undefined ||
                (item.to !== undefined &&
                  item.from <= item.to &&
                  item.to <= context.state.doc.length),
            )
            .map((item) => ({
              label: item.label,
              type: item.type,
              apply: (
                view: EditorView,
                _completion: Completion,
                from: number,
                to: number,
              ) => {
                view.dispatch(
                  insertCompletionText(
                    view.state,
                    item.apply,
                    item.from ?? from,
                    item.to ?? to,
                  ),
                );
              },
            }));
          return { from: word?.from ?? context.pos, options };
        },
      ],
    }),
  ];
  return {
    extensions,
    destroy: () => {
      active = false;
      generation++;
    },
  };
};
