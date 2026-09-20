// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setDiagnostics } from "@codemirror/lint";
import { inlineDiagnostics } from "../diagnostics";
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it("renders every message inline as text and shades the line by highest severity", () => {
  const view = new EditorView({ state: EditorState.create({ doc: "const x = 1;\nnext", extensions: [inlineDiagnostics] }) }); views.push(view);
  view.dispatch(setDiagnostics(view.state, [{ from: 0, to: 5, severity: "warning", message: "warning" }, { from: 6, to: 7, severity: "error", message: "<script>bad</script>" }, { from: 13, to: 17, severity: "info", message: "information" }]));
  expect(view.dom.querySelectorAll(".cm-inline-diagnostic")).toHaveLength(3);
  expect(view.dom.querySelector("script")).toBeNull();
  expect(view.dom.textContent).toContain("<script>bad</script>");
  expect(view.dom.querySelector(".cm-diagnostic-line-error")).not.toBeNull();
  view.dispatch(setDiagnostics(view.state, [])); expect(view.dom.querySelectorAll(".cm-inline-diagnostic")).toHaveLength(0);
});

it("filters problems locally by severity, message, and diagnostic code", async () => {
  const { filterEditorProblems } = await import("../problems");
  const diagnostics = [{ from: 0, to: 1, severity: "error" as const, message: "Type mismatch", code: 2322 }, { from: 2, to: 3, severity: "info" as const, message: "Unused value", code: 6133 }];
  expect(filterEditorProblems(diagnostics, "  TYPE ", "all")).toHaveLength(1);
  expect(filterEditorProblems(diagnostics, "TS6133", "all")).toHaveLength(1);
  expect(filterEditorProblems(diagnostics, "", "warning")).toHaveLength(0);
  expect(filterEditorProblems(diagnostics, "unused", "error")).toHaveLength(0);
});
