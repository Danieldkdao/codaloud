// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "codemirror";
import { deleteCharBackward, selectAll, undo } from "@codemirror/commands";
import { LanguageDescription, foldEffect, foldedRanges, type LanguageSupport } from "@codemirror/language";
import { openSearchPanel } from "@codemirror/search";
import { acceptCompletion, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { forceLinting, forEachDiagnostic, openLintPanel } from "@codemirror/lint";
import type { CodeEditorAnalysis, CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { codeEditorMatches } from "@/components/code-editor-matches";
import CodeEditor, { type CodeEditorRef } from "@/components/code-editor";

vi.mock("expo/dom", async () => ({ useDOMImperativeHandle: (await import("react")).useImperativeHandle }));

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

it("keeps read-only contents selectable while blocking editing commands", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "notes.txt", initialValue: "original", readOnly: true, onChange,
  })));
  const view = editor();
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
  expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
  expect(view.contentDOM.tabIndex).toBe(0);
  act(() => { selectAll(view); });
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("original");
  act(() => { expect(deleteCharBackward(view)).toBe(false); });
  expect(view.state.doc.toString()).toBe("original");
  expect(onChange).not.toHaveBeenCalled();
});

it("toggles read-only without resetting the document, selection, or undo history", async () => {
  const renderMode = async (readOnly?: boolean) => {
    await act(async () => root.render(createElement(CodeEditor, {
      filename: "notes.txt", initialValue: "original", readOnly,
    })));
  };
  await renderMode();
  const view = editor();
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  act(() => view.dispatch({ changes: { from: 0, insert: "edited " }, selection: { anchor: 7 } }));
  await renderMode(true);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toBe("edited original");
  expect(view.state.selection.main.head).toBe(7);
  act(() => { expect(undo(view)).toBe(false); });
  await renderMode(false);
  expect(editor()).toBe(view);
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  expect(view.contentDOM.getAttribute("aria-readonly")).toBe("false");
  act(() => { expect(undo(view)).toBe(true); });
  expect(view.state.doc.toString()).toBe("original");
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

it.each(["error", "warning", "info"] as const)("selects a %s diagnostic without extra underline layers regardless of stylesheet order", async (severity) => {
  const style = document.createElement("style");
  const baseStyle = document.createElement("style");
  style.textContent = readFileSync("src/styles/code-editor.css", "utf8");
  document.head.append(style);
  try {
    await act(async () => root.render(createElement(CodeEditor, {
      filename: "demo.ts", initialValue: 'const answer: number = "wrong";',
      onRequestAnalysis: async () => ({ diagnostics: [
        { from: 6, to: 12, severity, message: "Diagnostic", code: 2322 },
      ] }),
    })));
    act(() => forceLinting(editor()));
    await vi.waitFor(() => expect(container.querySelector(`.cm-lintRange-${severity}`)).not.toBeNull());
    act(() => { openLintPanel(editor()); });
    const selected = container.querySelector<HTMLElement>(".cm-lintRange-active")!;
    const mark = selected.querySelector<HTMLElement>(`.cm-lintRange-${severity}`)!;
    expect(selected).not.toBeNull();
    expect(mark).not.toBeNull();
    // Happy DOM drops CodeMirror's SVG data URLs. Preserve its selectors and
    // declarations with a simple URL so the background cascade is exercised.
    const theme = Array.from(document.head.querySelectorAll("style")).find((item) =>
      item !== style && item.textContent?.includes(".cm-lintRange-info"))!;
    baseStyle.textContent = theme.textContent!.replace(/url\('data:image\/svg\+xml,.*?'\)/g, 'url("diagnostic-underline.svg")');
    document.head.prepend(baseStyle);
    for (const position of ["last", "first"] as const) {
      if (position === "first") document.head.prepend(style);
      expect(getComputedStyle(selected).textDecoration).toBe("none");
      expect(getComputedStyle(mark).textDecoration).toBe("none");
      expect(getComputedStyle(mark).backgroundImage).toBe("none");
    }
  } finally { style.remove(); baseStyle.remove(); }
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

it("analyzes edits after a short pause without waiting for the former 600 ms debounce", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const request = vi.fn().mockResolvedValue({ diagnostics: [] });
    await act(async () => root.render(createElement(CodeEditor, {
      filename: "demo.ts", initialValue: "const answer = 42;", onRequestAnalysis: request,
    })));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(request).toHaveBeenCalledOnce();
    act(() => editor().dispatch({ changes: { from: 0, insert: "// edit\n" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(request).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].content).toContain("// edit");
  } finally { vi.useRealTimers(); }
});

it("keeps the last diagnostic counts while the next analysis is pending", async () => {
  const diagnostic = { from: 0, to: 1, severity: "error" as const, message: "Bad type", code: 2322 };
  let finish!: (value: { diagnostics: typeof diagnostic[] }) => void;
  const request = vi.fn().mockResolvedValueOnce({ diagnostics: [diagnostic] })
    .mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, { filename: "demo.ts", initialValue: "old", onRequestAnalysis: request, onAnalysis })));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(onAnalysis).toHaveBeenLastCalledWith({ status: "ready", diagnostics: [diagnostic] }));
  onAnalysis.mockClear();
  act(() => editor().dispatch({ changes: { from: 0, to: 3, insert: "new" } }));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(onAnalysis).not.toHaveBeenCalled();
  await act(async () => finish({ diagnostics: [] }));
  expect(onAnalysis).toHaveBeenLastCalledWith({ status: "ready", diagnostics: [] });
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


it("highlights literal case-insensitive terms, ignores empty duplicates, and navigates without editing or focusing", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    ref, filename: "notes.txt", initialValue: "A.b aXb a.B end", readOnly: true,
    matches: ["a.b", "A.B", "", "end"], onMatchesChange, onChange,
  })));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 3, activeIndex: 0 });
  expect(container.querySelectorAll(".cm-fileMatch")).toHaveLength(3);
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe("A.b");
  const selection = editor().state.selection;
  act(() => ref.current!.previousMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 3, activeIndex: 2 });
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe("end");
  act(() => { ref.current!.nextMatch(); ref.current!.nextMatch(); });
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 3, activeIndex: 1 });
  expect(editor().state.selection).toBe(selection);
  expect(editor().hasFocus).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

it("updates matches after edits and undo, without rescanning on navigation or losing the document", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  const show = (matches: string[]) => act(async () => root.render(createElement(CodeEditor, {
    ref, filename: "notes.txt", initialValue: "cat dog cat", matches, onMatchesChange,
  })));
  await show(["cat"]);
  const view = editor();
  act(() => view.dispatch({ changes: { from: 0, to: 3, insert: "dog" } }));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 1, activeIndex: 0 });
  await show(["dog"]);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toBe("dog dog cat");
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 2, activeIndex: 0 });
  const ranges = view.state.field(codeEditorMatches).ranges;
  act(() => ref.current!.nextMatch());
  expect(view.state.field(codeEditorMatches).ranges).toBe(ranges);
  const reports = onMatchesChange.mock.calls.length;
  await show(["dog"]);
  act(() => view.dispatch({ selection: { anchor: 1 } }));
  expect(onMatchesChange).toHaveBeenCalledTimes(reports);
  act(() => undo(view));
  expect(view.state.doc.toString()).toBe("cat dog cat");
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 1, activeIndex: 0 });
  await show([]);
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 0, activeIndex: null });
  expect(container.querySelector(".cm-fileMatch")).toBeNull();
  act(() => ref.current!.nextMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 0, activeIndex: null });
});

it("preserves original offsets for Unicode and matches across line breaks", async () => {
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "notes.txt", initialValue: "😀İ start\nfinish", matches: ["start\nfinish"], onMatchesChange,
  })));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 1, activeIndex: 0 });
  expect(Array.from(container.querySelectorAll(".cm-fileMatch-active")).map((node) => node.textContent).join("\n")).toBe("start\nfinish");
});

it("keeps exact totals above 100 and resets navigation for a new file", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    ref, filename: "many.txt", initialValue: "x ".repeat(125), matches: ["x"], onMatchesChange,
  })));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 125, activeIndex: 0 });
  act(() => ref.current!.previousMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 125, activeIndex: 124 });
  await act(async () => root.render(createElement(CodeEditor, {
    ref, filename: "empty.txt", initialValue: "", matches: ["x"], onMatchesChange,
  })));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 0, activeIndex: null });
});


it("keeps literal matching distinct from Unicode compatibility normalization", async () => {
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CodeEditor, {
    filename: "notes.txt", initialValue: "café cafe ﬁ fi", matches: ["cafe", "fi"], onMatchesChange,
  })));
  expect(onMatchesChange).toHaveBeenLastCalledWith({ total: 2, activeIndex: 0 });
});


it("reveals a match hidden inside a folded section", async () => {
  const ref = createRef<CodeEditorRef>();
  await act(async () => root.render(createElement(CodeEditor, {
    ref, filename: "notes.txt", initialValue: "target\n{\n  target\n}\n", matches: ["target"], readOnly: true,
  })));
  act(() => editor().dispatch({ effects: foldEffect.of({ from: 8, to: 18 }) }));
  expect(foldedRanges(editor().state).size).toBe(1);
  act(() => ref.current!.nextMatch());
  expect(foldedRanges(editor().state).size).toBe(0);
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe("target");
});


it("preserves per-document text, selection, scroll and undo when switching tabs", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const show = (key: string, initialValue: string) => act(async () => root.render(createElement(CodeEditor, {
    filename: `${key}.txt`, initialValue, documentKey: key, openDocumentKeys: ["a", "b"], onChange,
  })));
  await show("a", "first");
  act(() => editor().dispatch({ changes: { from: 0, insert: "edited " }, selection: { anchor: 3 } }));
  editor().scrollDOM.scrollTop = 84;
  await show("b", "second");
  expect(editor().state.sliceDoc()).toBe("second");
  act(() => editor().dispatch({ changes: { from: 0, insert: "other " } }));
  await show("a", "first");
  expect(editor().state.sliceDoc()).toBe("edited first");
  expect(editor().state.selection.main.anchor).toBe(3);
  expect(editor().scrollDOM.scrollTop).toBe(84);
  act(() => undo(editor()));
  expect(editor().state.sliceDoc()).toBe("first");
  expect(onChange).toHaveBeenLastCalledWith("first", "a");
  await show("b", "second");
  expect(editor().state.sliceDoc()).toBe("other second");
});

it("drops closed buffers and binds queued bridge events to their originating document", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const show = (key: string, keys: string[]) => act(async () => root.render(createElement(CodeEditor, {
    filename: `${key}.txt`, initialValue: "original", documentKey: key, openDocumentKeys: keys, onChange,
  })));
  await show("a", ["a", "b"]);
  act(() => editor().dispatch({ changes: { from: 0, insert: "old " } }));
  expect(onChange).toHaveBeenLastCalledWith("old original", "a");
  await show("b", ["b"]);
  await show("a", ["a", "b"]);
  expect(editor().state.sliceDoc()).toBe("original");
  expect(undo(editor())).toBe(false);
});
