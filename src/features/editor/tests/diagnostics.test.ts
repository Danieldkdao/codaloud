// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setDiagnostics } from "@codemirror/lint";
import { inlineDiagnostics } from "../diagnostics";
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it("renders each line's messages inline as text and shades the line by highest severity", () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "const x = 1;\nnext",
      extensions: [inlineDiagnostics],
    }),
  });
  views.push(view);
  view.dispatch(
    setDiagnostics(view.state, [
      { from: 0, to: 5, severity: "warning", message: "warning" },
      { from: 6, to: 7, severity: "error", message: "<script>bad</script>" },
      { from: 13, to: 17, severity: "info", message: "information" },
    ]),
  );
  // The first two findings sit on line one and share a single hint; the third
  // is alone on line two.
  expect(view.dom.querySelectorAll(".cm-inline-diagnostic")).toHaveLength(2);
  expect(view.dom.querySelector("script")).toBeNull();
  // Line one is reported under its worst finding, so both of its messages are
  // shown through the error hint.
  const firstLine = view.dom.querySelector(".cm-inline-error")!;
  expect(firstLine.textContent).toContain("<script>bad</script>");
  expect(firstLine.textContent).toContain("warning");
  expect(firstLine.getAttribute("aria-label")).toBe(
    "error: warning · <script>bad</script>",
  );
  expect(view.dom.textContent).toContain("<script>bad</script>");
  expect(view.dom.querySelector(".cm-inline-info")?.textContent?.trim()).toBe(
    "information",
  );
  expect(view.dom.querySelector(".cm-diagnostic-line-error")).not.toBeNull();
  view.dispatch(setDiagnostics(view.state, []));
  expect(view.dom.querySelectorAll(".cm-inline-diagnostic")).toHaveLength(0);
});

it("shows every message for one line inside a single inline hint", () => {
  // ShellCheck reports two parse errors on the same line, SC1049 and the SC1073
  // follow-up. One widget per diagnostic placed the second beside the first,
  // where it ran off the right edge of the editor and could not be read, so the
  // line looked like it had one problem when it had two.
  const view = new EditorView({
    state: EditorState.create({
      doc: "if true\n",
      extensions: [inlineDiagnostics],
    }),
  });
  views.push(view);
  view.dispatch(
    setDiagnostics(view.state, [
      {
        from: 0,
        to: 1,
        severity: "error",
        message: "Did you forget the 'then' for this 'if'?",
      },
      {
        from: 0,
        to: 1,
        severity: "error",
        message: "Couldn't parse this if expression.",
      },
    ]),
  );

  const hints = view.dom.querySelectorAll(".cm-inline-diagnostic");
  expect(hints).toHaveLength(1);
  expect(hints[0].textContent).toContain("Did you forget the 'then'");
  expect(hints[0].textContent).toContain("Couldn't parse this if expression");
  expect(hints[0].getAttribute("aria-label")).toBe(
    "error: Did you forget the 'then' for this 'if'? · Couldn't parse this if expression.",
  );
});

it("groups a mixed-severity line under its worst finding", () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "echo $x\n",
      extensions: [inlineDiagnostics],
    }),
  });
  views.push(view);
  view.dispatch(
    setDiagnostics(view.state, [
      { from: 0, to: 4, severity: "info", message: "unreferenced" },
      { from: 5, to: 7, severity: "warning", message: "word splitting" },
    ]),
  );

  const hint = view.dom.querySelector(".cm-inline-diagnostic")!;
  expect(hint.classList.contains("cm-inline-warning")).toBe(true);
  expect(hint.getAttribute("aria-label")).toBe(
    "warning: unreferenced · word splitting",
  );
  // The line is shaded by the worst severity on it, not the first one seen.
  expect(view.dom.querySelector(".cm-diagnostic-line-warning")).not.toBeNull();
  expect(view.dom.querySelector(".cm-diagnostic-line-info")).toBeNull();
});

it("detects a linter that reported only parser errors", async () => {
  const { isAnalysisSuppressed } = await import("../problems");
  const shell = (code: string) => ({
    from: 0,
    to: 1,
    severity: "error" as const,
    message: "problem",
    source: "ShellCheck",
    code,
  });
  // Every finding is a ShellCheck parser error, so the file never reached the
  // checks that would have produced warnings and suggestions.
  expect(
    isAnalysisSuppressed([
      shell("shellcheck:SC1049"),
      shell("shellcheck:SC1073"),
    ]),
  ).toBe(true);
  // One real lint finding means the file was analysed beyond parsing.
  expect(
    isAnalysisSuppressed([
      shell("shellcheck:SC1049"),
      shell("shellcheck:SC2114"),
    ]),
  ).toBe(false);
  // A clean file, and languages that report through their own recovery pass,
  // are never described as suppressed.
  expect(isAnalysisSuppressed([])).toBe(false);
  expect(
    isAnalysisSuppressed([
      {
        from: 0,
        to: 1,
        severity: "error",
        message: "expected ':'",
        source: "CPython",
        code: "python:syntax-error",
      },
    ]),
  ).toBe(false);
});

it("filters problems locally by severity, message, and diagnostic code", async () => {
  const { filterEditorProblems } = await import("../problems");
  const diagnostics = [
    {
      from: 0,
      to: 1,
      severity: "error" as const,
      message: "Type mismatch",
      source: "TypeScript",
      code: "TS2322",
    },
    {
      from: 2,
      to: 3,
      severity: "info" as const,
      message: "Unused value",
      source: "TypeScript",
      code: "TS6133",
    },
  ];
  expect(filterEditorProblems(diagnostics, "  MISMATCH ", "all")).toHaveLength(
    1,
  );
  expect(
    filterEditorProblems(diagnostics, "typescript ts6133", "all"),
  ).toHaveLength(1);
  expect(filterEditorProblems(diagnostics, "", "warning")).toHaveLength(0);
  expect(filterEditorProblems(diagnostics, "unused", "error")).toHaveLength(0);
});
