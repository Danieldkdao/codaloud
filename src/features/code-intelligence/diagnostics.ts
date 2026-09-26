import {
  codeDiagnosticSchema,
  type CodeDiagnosticSchema,
} from "@/features/projects/actions/code-intelligence-schemas";

export const MAX_CODE_DIAGNOSTICS = 200;

export const normalizeCodeDiagnostics = (
  content: string,
  findings: readonly unknown[],
): CodeDiagnosticSchema[] => {
  const normalized: CodeDiagnosticSchema[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const result = codeDiagnosticSchema.safeParse(finding);
    if (!result.success) continue;

    const diagnostic = result.data;
    if (diagnostic.to > content.length) continue;

    const key = JSON.stringify([
      diagnostic.source,
      diagnostic.code,
      diagnostic.from,
      diagnostic.to,
      diagnostic.message,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(diagnostic);
    if (normalized.length >= MAX_CODE_DIAGNOSTICS) break;
  }

  return normalized;
};
