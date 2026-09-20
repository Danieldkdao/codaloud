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
        `ts${item.code}`.includes(query)),
  );
};
