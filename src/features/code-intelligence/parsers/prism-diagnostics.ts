import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { toEditorDiagnostics } from "./native-diagnostics";

const SOURCE = "Prism";

export type PrismError = {
  // Prism omits `type` on some findings, such as the generic end-of-input
  // recovery error, so it is optional.
  type?: string;
  message: string;
  level: string;
  location?: { startOffset: number; length: number };
};

const toPrismDiagnosticCode = (type: string | undefined) =>
  `prism:${type ? type.replace(/_/g, "-") : "syntax-error"}`;

// Prism messages are written as sentence fragments, for example
// "expected an `end` to close the `def` statement". Capitalising the first
// letter matches how the other analyzers phrase their messages.
const capitalize = (message: string) =>
  message.length === 0 ? message : message[0].toUpperCase() + message.slice(1);

// A diagnostic with no location covers the whole file, so anchor it to the
// first line. A zero length location marks end-of-input, where a one byte span
// keeps the caret visible.
export const toPrismDiagnostics = (
  content: string,
  findings: readonly PrismError[],
): CodeDiagnosticSchema[] => {
  const newlineIndex = content.indexOf("\n");
  const fallbackEnd = newlineIndex < 0 ? content.length : newlineIndex;
  return toEditorDiagnostics(
    content,
    findings
      .filter((finding) => finding.level === "syntax")
      .flatMap((finding) => {
        const start = finding.location?.startOffset;
        const length = finding.location?.length ?? 0;
        const startOffset = start ?? 0;
        const endOffset =
          start === undefined ? fallbackEnd : start + Math.max(1, length);
        if (startOffset >= endOffset || startOffset < 0) return [];
        return [
          {
            startOffset,
            endOffset,
            message: capitalize(finding.message),
            code: toPrismDiagnosticCode(finding.type),
            // Prism tags each finding with a level. Only "syntax" means the file
            // would not run. Its other levels are lint-style advice such as
            // "assigned but unused variable", which belongs in a linter rather
            // than as an inline squiggle on every keystroke, so they are dropped
            // rather than shown as errors.
            severity: "error",
          },
        ];
      }),
    SOURCE,
  );
};
