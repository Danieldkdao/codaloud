import type { CodeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";

const SOURCE = "CPython";

export type PythonCheckError = {
  msg: string;
  lineno?: number;
  offset?: number;
};

export type PythonCheckResult = {
  ok: boolean;
  errors: PythonCheckError[];
};

// compile() stops at the first SyntaxError, so the checker repairs that construct
// (same line count, so line numbers stay valid) and recompiles to surface the rest.
export const PYTHON_CHECK_INSTALL_SOURCE = `
import json

MAX_ERRORS = 10
CLOSERS = {"(": ")", "[": "]", "{": "}"}
REPAIRS = {
    "expected ':'": "insert",
    "unmatched ')'": "blank",
    "unmatched ']'": "blank",
    "unmatched '}'": "blank",
    "'(' was never closed": "close",
    "'[' was never closed": "close",
    "'{' was never closed": "close",
    "unterminated string literal": "quote",
    "unterminated triple-quoted string literal": "quote",
}

def _codaloud_repair(source, error):
    kind = REPAIRS.get(error.msg)
    if kind is None and error.msg.startswith("expected an indented block"):
        kind = "indent"
    if kind is None or error.lineno is None:
        return None
    lines = source.split("\\n")
    index = error.lineno - 1
    if index < 0 or index >= len(lines):
        return None
    line = lines[index]
    if kind == "indent":
        lines[index] = "    " + line
        return "\\n".join(lines)
    if kind in ("close", "quote"):
        if kind == "close":
            add = CLOSERS.get(error.msg[1] if len(error.msg) > 1 else "")
        else:
            add = '"""' if "triple" in error.msg else '"'
        if not add:
            return None
        lines[index] = line + add
        return "\\n".join(lines)
    if error.offset is None:
        return None
    column = error.offset - 1
    if column < 0 or column > len(line):
        return None
    if kind == "insert":
        lines[index] = line[:column] + ":" + line[column:]
    else:
        lines[index] = line[:column] + " " + line[column + 1:]
    return "\\n".join(lines)

def _codaloud_check_json(source):
    errors = []
    reported = set()
    attempted = set()
    working = source
    for _ in range(MAX_ERRORS):
        try:
            compile(working, "<codaloud>", "exec")
            break
        except SyntaxError as error:
            key = (error.msg, error.lineno, error.offset)
            if key not in reported:
                reported.add(key)
                errors.append({
                    "msg": error.msg,
                    "lineno": error.lineno,
                    "offset": error.offset,
                })
            # Guard against a repair that cycles: compiling a source already
            # tried would report the same error forever.
            if working in attempted:
                break
            attempted.add(working)
            repaired = _codaloud_repair(working, error)
            if repaired is None or repaired == working:
                break
            working = repaired
        except ValueError as error:
            # A null byte in the source raises ValueError instead of SyntaxError,
            # and it carries no position to repair.
            errors.append({"msg": str(error)})
            break
    return json.dumps({"ok": not errors, "errors": errors})
`;

// Calls the checker directly: it already returns JSON text, and re-encoding it
// here would hand the decoder a JSON string literal instead of a result.
export const PYTHON_CHECK_EXPRESSION = "_codaloud_check_json(source)";

// Decoding is strict on purpose: a lenient result would look identical to a
// clean file, which is far harder to diagnose than a thrown error.
export const parsePythonCheckResult = (raw: unknown): PythonCheckResult => {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Python checker returned text that is not JSON");
    }
  }
  if (typeof value !== "object" || value === null)
    throw new Error("Python checker did not return a result object");
  const { ok, errors } = value as Record<string, unknown>;
  if (typeof ok !== "boolean")
    throw new Error("Python checker result is missing its ok flag");
  if (!Array.isArray(errors))
    throw new Error("Python checker result is missing its error list");
  return {
    ok,
    errors: errors.map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null)
        throw new Error("Python checker returned a malformed error entry");
      const { msg, lineno, offset } = entry as Record<string, unknown>;
      if (typeof msg !== "string")
        throw new Error("Python checker result is missing its error message");
      return {
        msg,
        lineno: typeof lineno === "number" ? lineno : undefined,
        offset: typeof offset === "number" ? offset : undefined,
      };
    }),
  };
};

// Byte offset of the start of every line, used to turn a one-based line number
// into a position in the editor's UTF-16 string.
const getLineStartOffsets = (content: string) => {
  const offsets = [0];
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") offsets.push(index + 1);
  }
  return offsets;
};

const toDiagnostic = (
  content: string,
  lineStartOffsets: number[],
  error: PythonCheckError,
): CodeDiagnosticSchema | null => {
  // An error with no line (e.g. a null byte) still has a message worth showing,
  // so it is anchored at the top of the document rather than dropped.
  if (error.lineno === undefined) {
    return {
      from: 0,
      to: Math.min(1, content.length),
      severity: "error",
      message: error.msg,
      source: SOURCE,
      code: "python:syntax-error",
    };
  }

  const lineIndex = error.lineno - 1;
  if (lineIndex < 0 || lineIndex >= lineStartOffsets.length) return null;
  const lineStart = lineStartOffsets[lineIndex];
  const nextLineStart = lineStartOffsets[lineIndex + 1];

  // A column past the line's end (as for "expected ':'") is pulled back to the
  // line's last character so a squiggle never spills onto the line break.
  const lastIndex =
    nextLineStart === undefined
      ? content.length - 1
      : Math.max(lineStart, nextLineStart - 2);
  const column = error.offset;
  const from =
    column === undefined
      ? lineStart
      : Math.min(lastIndex, lineStart + Math.max(0, column - 1));
  // Always cover at least one character: a zero-width marker renders as a bare
  // dot with no underline, which reads as no diagnostic at all.
  const to = Math.min(from + 1, lastIndex + 1);

  return {
    from: Math.max(0, Math.min(from, content.length)),
    to: Math.max(0, Math.min(to, content.length)),
    severity: "error",
    message: error.msg,
    source: SOURCE,
    code: "python:syntax-error",
  };
};

export const toPythonDiagnostics = (
  content: string,
  result: PythonCheckResult | null,
): CodeDiagnosticSchema[] => {
  if (!result || result.ok || result.errors.length === 0) return [];

  const lineStartOffsets = getLineStartOffsets(content);
  const diagnostics: CodeDiagnosticSchema[] = [];
  for (const error of result.errors) {
    // One entry the checker could not map must not cost us the rest: the whole
    // point of the list is that every reported mistake reaches the editor.
    const diagnostic = toDiagnostic(content, lineStartOffsets, error);
    if (diagnostic) diagnostics.push(diagnostic);
  }
  return diagnostics;
};
