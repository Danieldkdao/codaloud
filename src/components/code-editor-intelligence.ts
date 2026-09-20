import { linter } from "@codemirror/lint";
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
        // Retain squiggles and native badge counts without DOM hover popups.
        tooltipFilter: () => [],
        autoPanel: false,
        needsRefresh: (update) => update.focusChanged && update.view.hasFocus,
      },
    ),
  ];
  return {
    extensions,
    destroy: () => {
      active = false;
      generation++;
    },
  };
};
