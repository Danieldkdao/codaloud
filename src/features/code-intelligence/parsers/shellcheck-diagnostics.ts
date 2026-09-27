import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";

const SOURCE = "ShellCheck";

export type ShellCheckLintResult = {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  code: number;
  severity: "error" | "warning" | "info" | "style";
  message: string;
};

const toSeverity = (
  severity: ShellCheckLintResult["severity"],
): "error" | "warning" | "info" | null => {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    // "info" covers things like an unused variable and a missing shebang, which
    // are worth surfacing. "style" is a matter of taste rather than a defect,
    // so it is dropped rather than underlining correct code.
    case "info":
      return "info";
    case "style":
      return null;
    default: {
      const exhaustive: never = severity;
      return exhaustive;
    }
  }
};

// Byte offset of the start of every line, so a one-based line and column pair
// can be resolved to a position in the editor's UTF-16 string.
const getLineStartOffsets = (content: string) => {
  const offsets = [0];
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") offsets.push(index + 1);
  }
  return offsets;
};

export const toShellCheckDiagnostics = (
  content: string,
  results: readonly ShellCheckLintResult[],
): CodeDiagnosticSchema[] => {
  const lineStartOffsets = getLineStartOffsets(content);

  // The span of a reported line: where it starts, which index holds its last
  // character, and the first index past the line. The last character is one
  // before the newline, so a start never lands on the line break, while an end is
  // still allowed to sit immediately after it.
  const lineRange = (
    content: string,
    lineStartOffsets: number[],
    line: number,
  ) => {
    const lineIndex = line - 1;
    if (lineIndex < 0 || lineIndex >= lineStartOffsets.length) return null;
    const lineStart = lineStartOffsets[lineIndex];
    const nextLineStart = lineStartOffsets[lineIndex + 1];
    const limit =
      nextLineStart === undefined ? content.length : nextLineStart - 1;
    return {
      lineStart,
      lastIndex: Math.max(lineStart, limit - 1),
      limit,
    };
  };

  // ShellCheck columns are one-based.
  const columnOffset = (lineStart: number, column: number) =>
    lineStart + Math.max(0, column - 1);

  return results.flatMap((result) => {
    const severity = toSeverity(result.severity);
    if (!severity) return [];
    const range = lineRange(content, lineStartOffsets, result.line);
    if (!range) return [];
    // A start column past the end of the line is pulled back to the last
    // character so the marker does not begin on the line break.
    const from = Math.min(
      range.lastIndex,
      columnOffset(range.lineStart, result.column),
    );
    const endRange =
      result.endLine !== undefined && result.endColumn !== undefined
        ? lineRange(content, lineStartOffsets, result.endLine)
        : null;
    const end = endRange
      ? Math.min(
          endRange.limit,
          columnOffset(endRange.lineStart, result.endColumn!),
        )
      : null;
    // ShellCheck frequently reports no end position, and its parse errors report
    // one that lands on the start, because the parser has no token to point at.
    // Both leave a range too small to see, so the marker runs to an explicit end
    // when there is a usable one, to the end of the line otherwise, and always
    // covers at least one character.
    const to = Math.max(
      from,
      Math.min(end ?? range.limit, content.length),
      Math.min(from + 1, range.lastIndex + 1),
    );
    return [
      {
        from,
        to,
        severity,
        // ShellCheck prefixes some messages with "Warning:" even though the
        // severity field already carries that information.
        message: result.message.replace(/^Warning:\s*/, ""),
        source: SOURCE,
        code: `shellcheck:SC${result.code}`,
      },
    ];
  });
};
