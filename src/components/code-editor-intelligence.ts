import { linter } from "@codemirror/lint";
import type {
  CodeDiagnosticSchema,
  CodeIntelligenceRequestSchema,
  CodeIntelligenceResultSchema,
} from "@/features/projects/actions/code-intelligence-schemas";
import { createCodeAnalyzerRegistry } from "@/features/code-intelligence/analyzer-registry";

export type CodeEditorAnalysis = {
  status: "checking" | "ready" | "unavailable" | "unsupported";
  revision?: number;
  diagnostics: (CodeDiagnosticSchema & { line?: number; column?: number })[];
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
  const analyzer = createCodeAnalyzerRegistry(filename, request);
  const analyze = async (
    input: CodeIntelligenceRequestSchema,
    revision: number,
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
      return await analyzer.analyzeFile({ ...input, revision });
    } catch {
      return null;
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
          current,
          () => view.state.doc === doc && current === generation,
        );
        if (!active || view.state.doc !== doc || current !== generation)
          return [];
        if (!result) {
          onAnalysis({ status: "unavailable", diagnostics: [] });
          return [];
        }
        if (result.status !== "ready") {
          onAnalysis({
            status: result.status,
            revision: result.revision,
            diagnostics: [],
          });
          return [];
        }
        const diagnostics = result.diagnostics
          .filter(
            (item) =>
              item.from >= 0 && item.from <= item.to && item.to <= doc.length,
          )
          .map((item) => {
            const line = doc.lineAt(item.from);
            return {
              ...item,
              line: line.number,
              column: item.from - line.from + 1,
            };
          });
        hasAnalysis = true;
        onAnalysis({ status: "ready", revision: result.revision, diagnostics });
        return diagnostics.map((item) => ({
          ...item,
          source: item.source,
        }));
      },
      {
        delay: analyzer.debounceMs,
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
      analyzer.dispose();
    },
  };
};
