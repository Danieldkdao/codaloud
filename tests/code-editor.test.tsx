// @vitest-environment happy-dom
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "codemirror";
import { undo } from "@codemirror/commands";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { openSearchPanel } from "@codemirror/search";
import { acceptCompletion, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { forceLinting, forEachDiagnostic, openLintPanel } from "@codemirror/lint";
import type { CodeEditorAnalysis, CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CodeEditor from "@/components/code-editor";

const fontState = vi.hoisted(() => ({ loaded: true, error: null as Error | null }));
vi.mock("expo-font", () => ({ useFonts: () => [fontState.loaded, fontState.error] }));
vi.mock("@expo-google-fonts/jetbrains-mono/400Regular", () => ({ JetBrainsMono_400Regular: 1 }));
vi.mock("@expo-google-fonts/outfit/400Regular", () => ({ Outfit_400Regular: 2 }));

let container: HTMLDivElement;
let root: Root;
const render = (filename = "demo.ts", bottomInset = 0, onReady?: () => Promise<void>) => act(() => {
  root.render(createElement(CodeEditor, { filename, initialValue: "const answer = 42;", bottomInset, onReady }));
});
const editor = () => EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;

beforeEach(() => {
  fontState.loaded = true;
  fontState.error = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("reports document edits and undo through the native callback without reporting selection or initialization", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, { filename: "notes.txt", initialValue: "original", onChange })));
  const view = editor();
  expect(onChange).not.toHaveBeenCalled();
  act(() => view.dispatch({ selection: { anchor: 2 } }));
  expect(onChange).not.toHaveBeenCalled();
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "你好\r\n" } }));
  expect(onChange).toHaveBeenLastCalledWith("你好\n");
  act(() => undo(view));
  expect(onChange).toHaveBeenLastCalledWith("original");
  const replacement = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, { filename: "notes.txt", initialValue: "original", onChange: replacement })));
  expect(editor()).toBe(view);
  act(() => view.dispatch({ changes: { from: 0, insert: "edited " } }));
  expect(replacement).toHaveBeenCalledExactlyOnceWith("edited original");
});

it("preserves an existing CRLF document's line endings when saving edits", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, { filename: "notes.txt", initialValue: "first\r\nsecond\r\n", onChange })));
  act(() => editor().dispatch({ changes: { from: 0, insert: "edited " } }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("edited first\r\nsecond\r\n");
});

it("offers TypeScript object members at the cursor", async () => {
  const onReady = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "demo.ts", initialValue: 'const options: { enabled: boolean } = { enabled: true };\noptions.', onReady,
    onRequestAnalysis: async (input) => input.position === undefined ? { diagnostics: [] } : { completions: [{ label: "enabled", apply: "enabled", type: "property" }] },
  })));
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  const view = editor();
  act(() => {
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    startCompletion(view);
  });
  await vi.waitFor(() => expect(currentCompletions(view.state).map((option) => option.label)).toContain("enabled"));
  await vi.waitFor(() => { act(() => { expect(acceptCompletion(view)).toBe(true); }); });
  expect(view.state.doc.toString()).toContain("options.enabled");
});

it("automatically completes properties typed while a remote lookup is pending", async () => {
  const onReady = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn<CodeEditorAnalysisRequest>(async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return input.position === undefined ? { diagnostics: [] } : { completions: [{ label: "enabled", apply: "enabled", type: "property" }] };
  });
  const content = 'const options = { enabled: true };\noptions';
  await act(async () => root.render(createElement(CodeEditor, { filename: "demo.ts", initialValue: content, onReady, onRequestAnalysis: request })));
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  const view = editor();
  act(() => { view.focus(); view.dispatch({ selection: { anchor: content.length } }); });
  const type = (text: string) => act(() => view.dispatch({
    changes: { from: view.state.selection.main.head, insert: text },
    selection: { anchor: view.state.selection.main.head + text.length }, userEvent: "input.type",
  }));
  type(".");
  await vi.waitFor(() => expect(request.mock.calls.some(([input]) => input.content.endsWith("options."))).toBe(true));
  type("en");
  await vi.waitFor(() => expect(currentCompletions(view.state).map((option) => option.label)).toContain("enabled"), { timeout: 3000 });
});

it("applies a contextual string completion without duplicating quotes", async () => {
  const content = 'const mode = "f";';
  const from = content.indexOf('"') + 1;
  const onReady = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "demo.ts", initialValue: content, onReady,
    onRequestAnalysis: async (input) => input.position === undefined ? { diagnostics: [] } : {
      completions: [{ label: "fast", apply: "fast", type: "constant", from, to: from + 1 }],
    },
  })));
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  const view = editor();
  act(() => { view.dispatch({ selection: { anchor: from + 1 } }); startCompletion(view); });
  await vi.waitFor(() => expect(currentCompletions(view.state).length).toBe(1));
  await vi.waitFor(() => { act(() => { expect(acceptCompletion(view)).toBe(true); }); });
  expect(view.state.doc.toString()).toBe('const mode = "fast";');
});

it("marks and reports diagnostics, then clears corrected errors", async () => {
  const onAnalysis = vi.fn<(value: CodeEditorAnalysis) => Promise<void>>().mockResolvedValue();
  const request: CodeEditorAnalysisRequest = async (input) => ({ diagnostics: input.content.includes('"wrong"') ? [
    { from: 6, to: 12, severity: "error", message: "Type string is not assignable to number", code: 2322 },
    { from: 0, to: 5, severity: "warning", message: "Warning", code: 1 },
    { from: 6, to: 12, severity: "info", message: "Unused value", code: 6133 },
  ] : [] });
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "demo.ts", initialValue: 'const answer: number = "wrong";', onRequestAnalysis: request, onAnalysis,
  })));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(onAnalysis).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready", diagnostics: expect.any(Array) })));
  expect(container.querySelector(".cm-lintRange-error")).not.toBeNull();
  expect(onAnalysis.mock.lastCall?.[0].diagnostics.map((item) => item.severity)).toEqual(["error", "warning", "info"]);
  act(() => editor().dispatch({ changes: { from: 0, to: editor().state.doc.length, insert: "const answer: number = 42;" } }));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(onAnalysis).toHaveBeenLastCalledWith({ status: "ready", diagnostics: [] }));
  expect(container.querySelector(".cm-lintRange-error")).toBeNull();
});

it("selects a diagnostic without drawing a second underline around its severity mark", async () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/styles/code-editor.css", "utf8");
  document.head.append(style);
  try {
    await act(async () => root.render(createElement(CodeEditor, {
      filename: "demo.ts", initialValue: 'const answer: number = "wrong";',
      onRequestAnalysis: async () => ({ diagnostics: [
        { from: 6, to: 12, severity: "error" as const, message: "Type mismatch", code: 2322 },
      ] }),
    })));
    act(() => forceLinting(editor()));
    await vi.waitFor(() => expect(container.querySelector(".cm-lintRange-error")).not.toBeNull());
    act(() => { openLintPanel(editor()); });
    const selected = container.querySelector<HTMLElement>(".cm-lintRange-active")!;
    const error = selected.querySelector<HTMLElement>(".cm-lintRange-error")!;
    expect(selected).not.toBeNull();
    expect(error).not.toBeNull();
    expect(getComputedStyle(selected).textDecoration).toBe("none");
    expect(getComputedStyle(error).textDecoration).toContain("wavy");
    expect(getComputedStyle(error).backgroundImage).toBe("none");
  } finally { style.remove(); }
});

it("ignores diagnostics for older edits and closed editors", async () => {
  const pending: ((value: { diagnostics: [] }) => void)[] = [];
  const request = vi.fn(() => new Promise<{ diagnostics: [] }>((resolve) => pending.push(resolve)));
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, { filename: "demo.ts", initialValue: "old", onRequestAnalysis: request, onAnalysis })));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  act(() => editor().dispatch({ changes: { from: 0, to: 3, insert: "new" } }));
  await act(async () => pending[0]({ diagnostics: [] }));
  expect(onAnalysis.mock.calls.some(([value]) => value.status === "ready")).toBe(false);
  const diagnostics: unknown[] = [];
  forEachDiagnostic(editor().state, (value) => diagnostics.push(value));
  expect(diagnostics).toEqual([]);
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await act(async () => root.render(null));
  await act(async () => pending[1]({ diagnostics: [] }));
  expect(onAnalysis.mock.calls.some(([value]) => value.status === "ready")).toBe(false);
});

it("keeps edits and undo history when the available space changes", async () => {
  await render();
  const view = editor();
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: "\n// edited" } }));
  await render("demo.ts", 180);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// edited");
  act(() => { undo(view); });
  expect(view.state.doc.toString()).toBe("const answer = 42;");
});

it("updates the embedded appearance without losing edits or undo history", async () => {
  const renderTheme = async (colorScheme: "light" | "dark") => {
    await act(async () => root.render(createElement(CodeEditor, {
      filename: "demo.ts", initialValue: "const answer = 42;", colorScheme,
    })));
  };
  await renderTheme("light");
  const view = editor();
  act(() => view.dispatch({ changes: { from: 0, insert: "// keep me\n" } }));
  await renderTheme("dark");
  expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// keep me");
  act(() => { undo(view); });
  expect(view.state.doc.toString()).toBe("const answer = 42;");
  await renderTheme("light");
  expect(container.querySelector('[data-theme="light"]')).not.toBeNull();
});

it("creates a fresh document when the file identity changes", async () => {
  await render();
  const previous = editor();
  act(() => previous.dispatch({ changes: { from: 0, insert: "// old file\n" } }));
  await render("other.unknown");
  expect(editor()).not.toBe(previous);
  expect(editor().state.doc.toString()).toBe("const answer = 42;");
  expect(editor().contentDOM.getAttribute("aria-label")).toBe("other.unknown code editor");
});

it("keeps search available to editor commands without a web toolbar", async () => {
  await render();
  expect(container.querySelector("header")).toBeNull();
  expect(container.querySelector("details")).toBeNull();
  act(() => { openSearchPanel(editor()); });
  expect(container.querySelector('input[name="search"]')).not.toBeNull();
});


it("reports readiness after fonts and language setup, without resetting edits on callback changes", async () => {
  fontState.loaded = false;
  const onReady = vi.fn().mockResolvedValue(undefined);
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => new Promise((resolve) => { finishLanguage = resolve; }),
  } as unknown as LanguageDescription);
  await render("demo.ts", 0, onReady);
  const view = editor();
  expect(onReady).not.toHaveBeenCalled();
  fontState.loaded = true;
  await render("demo.ts", 0, onReady);
  expect(onReady).not.toHaveBeenCalled();
  await act(async () => { finishLanguage({ extension: [] } as unknown as LanguageSupport); });
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  act(() => view.dispatch({ changes: { from: 0, insert: "// keep edits\n" } }));
  const replacementCallback = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 180, replacementCallback);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// keep edits");
  expect(replacementCallback).not.toHaveBeenCalled();
});

it("still becomes ready with fallback fonts and unavailable highlighting", async () => {
  fontState.loaded = false;
  fontState.error = new Error("Font unavailable");
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => Promise.reject(new Error("Language unavailable")),
  } as unknown as LanguageDescription);
  const onReady = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 0, onReady);
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  expect(container.textContent).toContain("Highlighting unavailable");
});

it("does not report readiness for an editor removed during initialization", async () => {
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => new Promise((resolve) => { finishLanguage = resolve; }),
  } as unknown as LanguageDescription);
  const onReady = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 0, onReady);
  await act(async () => { root.render(null); });
  await act(async () => { finishLanguage({ extension: [] } as unknown as LanguageSupport); });
  expect(onReady).not.toHaveBeenCalled();
});
