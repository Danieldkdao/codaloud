import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import { mapUtf8OffsetsToUtf16 } from "./utf8-offsets";

export type NativeLanguageAnalysis = {
  status: "ready" | "unavailable";
  diagnostics: CodeDiagnosticSchema[];
};

// Shared shape for the compilers and linters that run in-process over
// WebAssembly. Every implementation is loaded lazily, cached by module, and
// disposed when the editor closes, so a heavy runtime is only paid for when its
// language is actually opened.
export type NativeLanguageAnalyzer = {
  analyze: (content: string) => Promise<NativeLanguageAnalysis>;
  dispose: () => void;
};

// A finding as reported by a native runtime. Positions are byte offsets into
// the UTF-8 encoding of the source, which is what compilers and linters emit.
export type NativeRuntimeDiagnostic = {
  startOffset: number;
  endOffset: number;
  message: string;
  code: string;
  severity: "error" | "warning" | "info";
};

export const isAnalyzableContent = (content: string) =>
  new TextEncoder().encode(content).length <= MAX_PROJECT_FILE_SIZE_BYTES;

// Native runtimes report byte offsets into the UTF-8 encoding of the source.
// Convert them to the editor's UTF-16 offsets, dropping any finding whose span
// cannot be mapped, since a misplaced squiggle is worse than a missing one.
export const toEditorDiagnostics = (
  content: string,
  findings: readonly NativeRuntimeDiagnostic[],
  source: string,
): CodeDiagnosticSchema[] => {
  const mapped = mapUtf8OffsetsToUtf16(
    content,
    findings.flatMap((finding) => [finding.startOffset, finding.endOffset]),
  );
  return findings.flatMap((finding) => {
    const from = mapped.get(finding.startOffset);
    const to = mapped.get(finding.endOffset);
    if (from === undefined || to === undefined) return [];
    return [
      {
        from,
        to: Math.max(from, to),
        severity: finding.severity,
        message: finding.message,
        source,
        code: finding.code,
      },
    ];
  });
};
