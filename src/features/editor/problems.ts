import type {
  CodeDiagnosticSchema,
  DiagnosticSeverity,
} from "@/features/projects/actions/code-intelligence-schemas";

export const filterEditorProblems = <T extends CodeDiagnosticSchema>(
  diagnostics: T[],
  search: string,
  severity: DiagnosticSeverity | "all",
) => {
  const query = search.trim().toLocaleLowerCase();
  return diagnostics.filter(
    (item) =>
      (severity === "all" || item.severity === severity) &&
      (!query ||
        item.message.toLocaleLowerCase().includes(query) ||
        `${item.source} ${item.code}`.toLocaleLowerCase().includes(query)),
  );
};

// ShellCheck stops at the first parse error: if the file does not parse it
// reports only parser findings and never runs the checks that look at what the
// script means. Its parser findings are the SC1xxx range, so a result made up
// entirely of them means the rest of the analysis was skipped rather than
// passed. Python and Prism report through their own recovery passes, so this
// does not apply to them and they are deliberately excluded here.
const SHELL_CHECK_PARSER_CODE = /^shellcheck:SC(\d+)$/;
const SHELL_CHECK_FIRST_LINT_CODE = 1100;

export const isAnalysisSuppressed = (
  diagnostics: readonly CodeDiagnosticSchema[],
): boolean => {
  if (diagnostics.length === 0) return false;
  return diagnostics.every((item) => {
    const match = item.code.match(SHELL_CHECK_PARSER_CODE);
    return match !== null && Number(match[1]) < SHELL_CHECK_FIRST_LINT_CODE;
  });
};
