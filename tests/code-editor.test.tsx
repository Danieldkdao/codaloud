// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "codemirror";
import { deleteCharBackward, selectAll, undo } from "@codemirror/commands";
import {
  LanguageDescription,
  codeFolding,
  foldEffect,
  foldedRanges,
  type LanguageSupport,
} from "@codemirror/language";
import { StateEffect } from "@codemirror/state";
import { runScopeHandlers } from "@codemirror/view";
import { currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { forceLinting, forEachDiagnostic } from "@codemirror/lint";
import type {
  CodeEditorAnalysis,
  CodeEditorAnalysisRequest,
} from "@/components/code-editor-intelligence";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { codeEditorMatches } from "@/components/code-editor-matches";
import CodeEditor, { type CodeEditorRef } from "@/components/code-editor";

vi.mock("@/features/editor/fonts", () => ({ editorFontAssets: {} }));
vi.mock("expo/dom", async () => ({
  useDOMImperativeHandle: (await import("react")).useImperativeHandle,
}));

const fontState = vi.hoisted(() => ({
  loaded: true,
  error: null as Error | null,
}));
vi.mock("expo-font", () => ({
  useFonts: () => [fontState.loaded, fontState.error],
}));
vi.mock("@expo-google-fonts/jetbrains-mono/400Regular", () => ({
  JetBrainsMono_400Regular: 1,
}));
vi.mock("@expo-google-fonts/outfit/400Regular", () => ({
  Outfit_400Regular: 2,
}));
const pythonAnalyzerMock = vi.hoisted(() => ({
  analyze: vi.fn(),
  dispose: vi.fn(),
}));
const treeSitterLoaderMock = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock("@/features/code-intelligence/parsers/grammar-loader", () => ({
  createTreeSitterLanguageAnalyzer: (grammarId: string) =>
    treeSitterLoaderMock.create(grammarId),
}));

let container: HTMLDivElement;
let root: Root;
const render = (
  filename = "demo.ts",
  bottomInset = 0,
  onReady?: () => Promise<void>,
) =>
  act(() => {
    root.render(
      createElement(CodeEditor, {
        filename,
        initialValue: "const answer = 42;",
        bottomInset,
        onReady,
      }),
    );
  });
const editor = () =>
  EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;

beforeEach(() => {
  fontState.loaded = true;
  fontState.error = null;
  treeSitterLoaderMock.create.mockReturnValue(pythonAnalyzerMock);
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
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "original",
        onChange,
      }),
    ),
  );
  const view = editor();
  expect(onChange).not.toHaveBeenCalled();
  act(() => view.dispatch({ selection: { anchor: 2 } }));
  expect(onChange).not.toHaveBeenCalled();
  act(() =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "你好\r\n" },
    }),
  );
  expect(onChange).toHaveBeenLastCalledWith("你好\n");
  act(() => undo(view));
  expect(onChange).toHaveBeenLastCalledWith("original");
  const replacement = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "original",
        onChange: replacement,
      }),
    ),
  );
  expect(editor()).toBe(view);
  act(() => view.dispatch({ changes: { from: 0, insert: "edited " } }));
  expect(replacement).toHaveBeenCalledExactlyOnceWith("edited original");
});

it("preserves an existing CRLF document's line endings when saving edits", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "first\r\nsecond\r\n",
        onChange,
      }),
    ),
  );
  act(() => editor().dispatch({ changes: { from: 0, insert: "edited " } }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    "edited first\r\nsecond\r\n",
  );
});

it("keeps read-only contents selectable while blocking editing commands", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "original",
        readOnly: true,
        onChange,
      }),
    ),
  );
  const view = editor();
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
  expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
  expect(view.contentDOM.tabIndex).toBe(0);
  act(() => {
    selectAll(view);
  });
  expect(
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  ).toBe("original");
  act(() => {
    expect(deleteCharBackward(view)).toBe(false);
  });
  expect(view.state.doc.toString()).toBe("original");
  expect(onChange).not.toHaveBeenCalled();
});

it("toggles read-only without resetting the document, selection, or undo history", async () => {
  const renderMode = async (readOnly?: boolean) => {
    await act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: "notes.txt",
          initialValue: "original",
          readOnly,
        }),
      ),
    );
  };
  await renderMode();
  const view = editor();
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  act(() =>
    view.dispatch({
      changes: { from: 0, insert: "edited " },
      selection: { anchor: 7 },
    }),
  );
  await renderMode(true);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toBe("edited original");
  expect(view.state.selection.main.head).toBe(7);
  act(() => {
    expect(undo(view)).toBe(false);
  });
  await renderMode(false);
  expect(editor()).toBe(view);
  expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  expect(view.contentDOM.getAttribute("aria-readonly")).toBe("false");
  act(() => {
    expect(undo(view)).toBe(true);
  });
  expect(view.state.doc.toString()).toBe("original");
});

it("offers typed completions in a floating popup and accepts a touch-sized option", async () => {
  const request = vi.fn<CodeEditorAnalysisRequest>(async (input) =>
    input.position === undefined
      ? { diagnostics: [] }
      : {
          completions: [
            { label: "enabled", apply: "enabled", type: "property" },
          ],
        },
  );
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "demo.ts",
        initialValue: "options.",
        onRequestAnalysis: request,
      }),
    ),
  );
  const view = editor();
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(startCompletion(view)).toBe(true);
  });
  await vi.waitFor(() =>
    expect(currentCompletions(view.state)).toHaveLength(1),
  );
  expect(container.querySelector(".cm-tooltip-autocomplete")).not.toBeNull();
  expect(container.querySelector(".cm-completion-kind")?.textContent).toBe("▪");
  const { acceptCompletion } = await import("@codemirror/autocomplete");
  await vi.waitFor(() => {
    act(() => {
      expect(acceptCompletion(view)).toBe(true);
    });
  });
  expect(view.state.doc.toString()).toBe("options.enabled");
});

it("marks and reports diagnostics, then clears corrected errors", async () => {
  const onAnalysis = vi
    .fn<(value: CodeEditorAnalysis) => Promise<void>>()
    .mockResolvedValue();
  const request: CodeEditorAnalysisRequest = async (input) => ({
    diagnostics: input.content.includes('"wrong"')
      ? [
          {
            from: 6,
            to: 12,
            severity: "error",
            message: "Type string is not assignable to number",
            source: "TypeScript",
            code: "TS2322",
          },
          {
            from: 0,
            to: 5,
            severity: "warning",
            message: "Warning",
            source: "TypeScript",
            code: "codaloud:warning",
          },
          {
            from: 6,
            to: 12,
            severity: "info",
            message: "Unused value",
            source: "TypeScript",
            code: "TS6133",
          },
        ]
      : [],
  });
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "demo.ts",
        initialValue: 'const answer: number = "wrong";',
        onRequestAnalysis: request,
        onAnalysis,
      }),
    ),
  );
  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        diagnostics: expect.any(Array),
      }),
    ),
  );
  expect(container.querySelector(".cm-lintRange-error")).not.toBeNull();
  expect(
    onAnalysis.mock.lastCall?.[0].diagnostics.map((item) => item.severity),
  ).toEqual(["error", "warning", "info"]);
  const diagnosticSources: string[] = [];
  forEachDiagnostic(editor().state, (diagnostic) => {
    if (diagnostic.source) diagnosticSources.push(diagnostic.source);
  });
  expect(diagnosticSources).toContain("TypeScript");
  act(() =>
    editor().dispatch({
      changes: {
        from: 0,
        to: editor().state.doc.length,
        insert: "const answer: number = 42;",
      },
    }),
  );
  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready", diagnostics: [] }),
    ),
  );
  expect(container.querySelector(".cm-lintRange-error")).toBeNull();
});

it("runs Python diagnostics in the editor DOM and disposes the parser on close", async () => {
  pythonAnalyzerMock.analyze.mockResolvedValue({
    status: "ready",
    diagnostics: [
      {
        from: 8,
        to: 9,
        severity: "error",
        message: "Unexpected syntax",
        source: "Tree-sitter: Python",
        code: "tree-sitter-python:syntax-error",
      },
    ],
  });
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  const onRequestAnalysis = vi.fn();
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "broken.py",
        initialValue: "value = )",
        onAnalysis,
        onRequestAnalysis,
      }),
    ),
  );

  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        diagnostics: [
          expect.objectContaining({ source: "Tree-sitter: Python" }),
        ],
      }),
    ),
  );
  expect(pythonAnalyzerMock.analyze).toHaveBeenCalledWith("value = )");
  expect(onRequestAnalysis).not.toHaveBeenCalled();
  expect(container.querySelector(".cm-lintRange-error")).not.toBeNull();

  act(() => root.unmount());
  await vi.waitFor(() =>
    expect(pythonAnalyzerMock.dispose).toHaveBeenCalledOnce(),
  );
});

it("runs the filename-selected Java grammar without a native compiler request", async () => {
  const javaAnalyzer = {
    analyze: vi.fn(async () => ({
      status: "ready" as const,
      diagnostics: [
        {
          from: 11,
          to: 12,
          severity: "error" as const,
          message: "Unexpected syntax",
          source: "Tree-sitter: Java",
          code: "tree-sitter-java:syntax-error",
        },
      ],
    })),
    dispose: vi.fn(),
  };
  treeSitterLoaderMock.create.mockReturnValue(javaAnalyzer);
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  const onRequestAnalysis = vi.fn();
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "Main.java",
        initialValue: "class Main {",
        onAnalysis,
        onRequestAnalysis,
      }),
    ),
  );

  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        diagnostics: [expect.objectContaining({ source: "Tree-sitter: Java" })],
      }),
    ),
  );
  expect(treeSitterLoaderMock.create).toHaveBeenCalledWith("java");
  expect(onRequestAnalysis).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(javaAnalyzer.dispose).toHaveBeenCalledOnce();
});

it("runs JSONC diagnostics and selects its JSON highlighting mode", async () => {
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  const onRequestAnalysis = vi.fn();
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "settings.jsonc",
        initialValue: '{\n  "enabled": true\n  "other": false\n}',
        onAnalysis,
        onRequestAnalysis,
      }),
    ),
  );

  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        diagnostics: [expect.objectContaining({ source: "JSONC parser" })],
      }),
    ),
  );
  expect(onRequestAnalysis).not.toHaveBeenCalled();
});

it.each(["error", "warning", "info"] as const)(
  "renders a %s diagnostic without extra underline layers regardless of stylesheet order",
  async (severity) => {
    const style = document.createElement("style");
    const baseStyle = document.createElement("style");
    style.textContent = readFileSync("src/styles/code-editor.css", "utf8");
    document.head.append(style);
    try {
      await act(async () =>
        root.render(
          createElement(CodeEditor, {
            filename: "demo.ts",
            initialValue: 'const answer: number = "wrong";',
            onRequestAnalysis: async () => ({
              diagnostics: [
                {
                  from: 6,
                  to: 12,
                  severity,
                  message: "Diagnostic",
                  source: "TypeScript",
                  code: "TS2322",
                },
              ],
            }),
          }),
        ),
      );
      act(() => forceLinting(editor()));
      await vi.waitFor(() =>
        expect(
          container.querySelector(`.cm-lintRange-${severity}`),
        ).not.toBeNull(),
      );
      const mark = container.querySelector<HTMLElement>(
        `.cm-lintRange-${severity}`,
      )!;
      expect(mark).not.toBeNull();
      // Happy DOM drops CodeMirror's SVG data URLs. Preserve its selectors and
      // declarations with a simple URL so the background cascade is exercised.
      const theme = Array.from(document.head.querySelectorAll("style")).find(
        (item) =>
          item !== style && item.textContent?.includes(".cm-lintRange-info"),
      )!;
      baseStyle.textContent = theme.textContent!.replace(
        /url\('data:image\/svg\+xml,.*?'\)/g,
        'url("diagnostic-underline.svg")',
      );
      document.head.prepend(baseStyle);
      for (const position of ["last", "first"] as const) {
        if (position === "first") document.head.prepend(style);
        expect(getComputedStyle(mark).textDecoration).toBe("none");
        expect(getComputedStyle(mark).backgroundImage).toBe("none");
      }
    } finally {
      style.remove();
      baseStyle.remove();
    }
  },
);

it("keeps diagnostic underlines without showing a hover popup", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const style = document.createElement("style");
  style.textContent = readFileSync("src/styles/code-editor.css", "utf8");
  document.head.append(style);
  try {
    await act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: "demo.ts",
          initialValue: "const value = 1;",
          onRequestAnalysis: async () => ({
            diagnostics: [
              {
                from: 6,
                to: 11,
                severity: "error" as const,
                message: "Diagnostic details",
                source: "TypeScript",
                code: "TS1",
              },
            ],
          }),
        }),
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    const view = editor();
    const mark = container.querySelector(".cm-lintRange-error")!;
    expect(mark).not.toBeNull();
    const coords = vi.spyOn(view, "posAtCoords").mockReturnValue(8);
    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      left: 10,
      right: 20,
      top: 0,
      bottom: 20,
    });
    act(() =>
      mark.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 15,
          clientY: 10,
        }),
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(coords).toHaveBeenCalled();
    const tooltip = container.querySelector(".cm-tooltip");
    expect(tooltip ? getComputedStyle(tooltip).display : "none").toBe("none");
    expect(
      container.querySelector(".cm-inline-diagnostic")?.textContent,
    ).toContain("Diagnostic details");
    expect(container.querySelector(".cm-panel")).toBeNull();
  } finally {
    style.remove();
    vi.useRealTimers();
  }
});

it("ignores diagnostics for older edits and closed editors", async () => {
  const pending: ((value: { diagnostics: [] }) => void)[] = [];
  const request = vi.fn(
    () => new Promise<{ diagnostics: [] }>((resolve) => pending.push(resolve)),
  );
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "demo.ts",
        initialValue: "old",
        onRequestAnalysis: request,
        onAnalysis,
      }),
    ),
  );
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  act(() => editor().dispatch({ changes: { from: 0, to: 3, insert: "new" } }));
  await act(async () => pending[0]({ diagnostics: [] }));
  expect(
    onAnalysis.mock.calls.some(([value]) => value.status === "ready"),
  ).toBe(false);
  const diagnostics: unknown[] = [];
  forEachDiagnostic(editor().state, (value) => diagnostics.push(value));
  expect(diagnostics).toEqual([]);
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await act(async () => root.render(null));
  await act(async () => pending[1]({ diagnostics: [] }));
  expect(
    onAnalysis.mock.calls.some(([value]) => value.status === "ready"),
  ).toBe(false);
});

it("analyzes edits after a short pause without waiting for the former 600 ms debounce", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const request = vi.fn().mockResolvedValue({ diagnostics: [] });
    await act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: "demo.ts",
          initialValue: "const answer = 42;",
          onRequestAnalysis: request,
        }),
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(request).toHaveBeenCalledOnce();
    act(() => editor().dispatch({ changes: { from: 0, insert: "// edit\n" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(request).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].content).toContain("// edit");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the last diagnostic counts while the next analysis is pending", async () => {
  const diagnostic = {
    from: 0,
    to: 1,
    severity: "error" as const,
    message: "Bad type",
    source: "TypeScript",
    code: "TS2322",
  };
  let finish!: (value: { diagnostics: (typeof diagnostic)[] }) => void;
  const request = vi
    .fn()
    .mockResolvedValueOnce({ diagnostics: [diagnostic] })
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const onAnalysis = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "demo.ts",
        initialValue: "old",
        onRequestAnalysis: request,
        onAnalysis,
      }),
    ),
  );
  act(() => forceLinting(editor()));
  await vi.waitFor(() =>
    expect(onAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        diagnostics: [expect.objectContaining(diagnostic)],
      }),
    ),
  );
  onAnalysis.mockClear();
  act(() => editor().dispatch({ changes: { from: 0, to: 3, insert: "new" } }));
  act(() => forceLinting(editor()));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(onAnalysis).not.toHaveBeenCalled();
  await act(async () => finish({ diagnostics: [] }));
  expect(onAnalysis).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "ready", diagnostics: [] }),
  );
});

it("keeps edits and undo history when the available space changes", async () => {
  await render();
  const view = editor();
  act(() =>
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "\n// edited" },
    }),
  );
  await render("demo.ts", 180);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// edited");
  act(() => {
    undo(view);
  });
  expect(view.state.doc.toString()).toBe("const answer = 42;");
});

it("updates the embedded appearance without losing edits or undo history", async () => {
  const renderTheme = async (colorScheme: "light" | "dark") => {
    await act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: "demo.ts",
          initialValue: "const answer = 42;",
          colorScheme,
        }),
      ),
    );
  };
  await renderTheme("light");
  const view = editor();
  act(() => view.dispatch({ changes: { from: 0, insert: "// keep me\n" } }));
  await renderTheme("dark");
  expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// keep me");
  act(() => {
    undo(view);
  });
  expect(view.state.doc.toString()).toBe("const answer = 42;");
  await renderTheme("light");
  expect(container.querySelector('[data-theme="light"]')).not.toBeNull();
});

it("creates a fresh document when the file identity changes", async () => {
  await render();
  const previous = editor();
  act(() =>
    previous.dispatch({ changes: { from: 0, insert: "// old file\n" } }),
  );
  await render("other.unknown");
  expect(editor()).toBe(previous);
  expect(editor().state.doc.toString()).toBe("const answer = 42;");
  expect(editor().contentDOM.getAttribute("aria-label")).toBe(
    "other.unknown code editor",
  );
});

it.each([
  { key: "f", ctrlKey: true },
  { key: "f", metaKey: true },
  { key: "g", ctrlKey: true },
  { key: "g", metaKey: true },
  { key: "G", keyCode: 71, ctrlKey: true, shiftKey: true },
  { key: "G", keyCode: 71, metaKey: true, shiftKey: true },
  { key: "g", ctrlKey: true, altKey: true },
  { key: "g", metaKey: true, altKey: true },
  { key: "F3" },
  { key: "F3", shiftKey: true },
  { key: "M", keyCode: 77, ctrlKey: true, shiftKey: true },
  { key: "M", keyCode: 77, metaKey: true, shiftKey: true },
  { key: "F8" },
  { key: "F8", shiftKey: true },
  { key: "d", ctrlKey: true },
  { key: "d", metaKey: true },
  { key: "L", keyCode: 76, ctrlKey: true, shiftKey: true },
  { key: "L", keyCode: 76, metaKey: true, shiftKey: true },
  { key: "{", keyCode: 219, ctrlKey: true, shiftKey: true },
  { key: "[", metaKey: true, altKey: true },
  { key: "[", ctrlKey: true, altKey: true },
])("does not bind a built-in editor helper to %j", async (keys) => {
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "demo.ts",
        initialValue: "const answer = 42;",
        onRequestAnalysis: async () => ({ diagnostics: [] }),
      }),
    ),
  );
  act(() => {
    expect(
      runScopeHandlers(editor(), new KeyboardEvent("keydown", keys), "editor"),
    ).toBe(false);
  });
  expect(
    container.querySelector(".cm-panel, .cm-tooltip-autocomplete"),
  ).toBeNull();
  expect(editor().state.doc.toString()).toBe("const answer = 42;");
});

it("keeps line numbers without built-in folding controls or selection-match highlights", async () => {
  await render();
  expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
  expect(container.querySelector(".cm-foldGutter")).toBeNull();
  act(() => editor().dispatch({ selection: { anchor: 6, head: 12 } }));
  expect(container.querySelector(".cm-selectionMatch")).toBeNull();
});

it("reports readiness after fonts without waiting for language setup, without resetting edits on callback changes", async () => {
  fontState.loaded = false;
  const onReady = vi.fn().mockResolvedValue(undefined);
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () =>
      new Promise((resolve) => {
        finishLanguage = resolve;
      }),
  } as unknown as LanguageDescription);
  await render("demo.ts", 0, onReady);
  const view = editor();
  expect(onReady).not.toHaveBeenCalled();
  fontState.loaded = true;
  await render("demo.ts", 0, onReady);
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  await act(async () => {
    finishLanguage({ extension: [] } as unknown as LanguageSupport);
  });
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
  fontState.loaded = false;
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () =>
      new Promise((resolve) => {
        finishLanguage = resolve;
      }),
  } as unknown as LanguageDescription);
  const onReady = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 0, onReady);
  await act(async () => {
    root.render(null);
  });
  await act(async () => {
    finishLanguage({ extension: [] } as unknown as LanguageSupport);
  });
  expect(onReady).not.toHaveBeenCalled();
});

it("highlights literal case-insensitive terms, ignores empty duplicates, and navigates without editing or focusing", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "notes.txt",
        initialValue: "A.b aXb a.B end",
        readOnly: true,
        matches: ["a.b", "A.B", "", "end"],
        onMatchesChange,
        onChange,
      }),
    ),
  );
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 3,
    activeIndex: 0,
  });
  expect(container.querySelectorAll(".cm-fileMatch")).toHaveLength(3);
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe(
    "A.b",
  );
  const selection = editor().state.selection;
  act(() => ref.current!.previousMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 3,
    activeIndex: 2,
  });
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe(
    "end",
  );
  act(() => {
    ref.current!.nextMatch();
    ref.current!.nextMatch();
  });
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 3,
    activeIndex: 1,
  });
  expect(editor().state.selection).toBe(selection);
  expect(editor().hasFocus).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

it("updates matches after edits and undo, without rescanning on navigation or losing the document", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  const show = (matches: string[]) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          ref,
          filename: "notes.txt",
          initialValue: "cat dog cat",
          matches,
          onMatchesChange,
        }),
      ),
    );
  await show(["cat"]);
  const view = editor();
  act(() => view.dispatch({ changes: { from: 0, to: 3, insert: "dog" } }));
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 1,
    activeIndex: 0,
  });
  await show(["dog"]);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toBe("dog dog cat");
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 2,
    activeIndex: 0,
  });
  const ranges = view.state.field(codeEditorMatches).ranges;
  act(() => ref.current!.nextMatch());
  expect(view.state.field(codeEditorMatches).ranges).toBe(ranges);
  const reports = onMatchesChange.mock.calls.length;
  await show(["dog"]);
  act(() => view.dispatch({ selection: { anchor: 1 } }));
  expect(onMatchesChange).toHaveBeenCalledTimes(reports);
  act(() => undo(view));
  expect(view.state.doc.toString()).toBe("cat dog cat");
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 1,
    activeIndex: 0,
  });
  await show([]);
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 0,
    activeIndex: null,
  });
  expect(container.querySelector(".cm-fileMatch")).toBeNull();
  act(() => ref.current!.nextMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 0,
    activeIndex: null,
  });
});

it("preserves original offsets for Unicode and matches across line breaks", async () => {
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "😀İ start\nfinish",
        matches: ["start\nfinish"],
        onMatchesChange,
      }),
    ),
  );
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 1,
    activeIndex: 0,
  });
  expect(
    Array.from(container.querySelectorAll(".cm-fileMatch-active"))
      .map((node) => node.textContent)
      .join("\n"),
  ).toBe("start\nfinish");
});

it("keeps exact totals above 100 and resets navigation for a new file", async () => {
  const ref = createRef<CodeEditorRef>();
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "many.txt",
        initialValue: "x ".repeat(125),
        matches: ["x"],
        onMatchesChange,
      }),
    ),
  );
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 125,
    activeIndex: 0,
  });
  act(() => ref.current!.previousMatch());
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 125,
    activeIndex: 124,
  });
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "empty.txt",
        initialValue: "",
        matches: ["x"],
        onMatchesChange,
      }),
    ),
  );
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 0,
    activeIndex: null,
  });
});

it("keeps literal matching distinct from Unicode compatibility normalization", async () => {
  const onMatchesChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        filename: "notes.txt",
        initialValue: "café cafe ﬁ fi",
        matches: ["cafe", "fi"],
        onMatchesChange,
      }),
    ),
  );
  expect(onMatchesChange).toHaveBeenLastCalledWith({
    total: 2,
    activeIndex: 0,
  });
});

it("reveals a match hidden inside a folded section", async () => {
  const ref = createRef<CodeEditorRef>();
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "notes.txt",
        initialValue: "target\n{\n  target\n}\n",
        matches: ["target"],
        readOnly: true,
      }),
    ),
  );
  // The match helper still handles folds supplied by a future native control.
  act(() =>
    editor().dispatch({ effects: StateEffect.appendConfig.of(codeFolding()) }),
  );
  act(() => editor().dispatch({ effects: foldEffect.of({ from: 8, to: 18 }) }));
  expect(foldedRanges(editor().state).size).toBe(1);
  act(() => ref.current!.nextMatch());
  expect(foldedRanges(editor().state).size).toBe(0);
  expect(container.querySelector(".cm-fileMatch-active")?.textContent).toBe(
    "target",
  );
});

it("preserves per-document text, selection, scroll and undo when switching tabs", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const show = (key: string, initialValue: string) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: `${key}.txt`,
          initialValue,
          documentKey: key,
          openDocumentKeys: ["a", "b"],
          onChange,
        }),
      ),
    );
  await show("a", "first");
  act(() =>
    editor().dispatch({
      changes: { from: 0, insert: "edited " },
      selection: { anchor: 3 },
    }),
  );
  editor().scrollDOM.scrollTop = 84;
  await show("b", "second");
  expect(editor().state.sliceDoc()).toBe("second");
  expect(editor().scrollDOM.scrollTop).toBe(0);
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
  const show = (key: string, keys: string[]) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: `${key}.txt`,
          initialValue: "original",
          documentKey: key,
          openDocumentKeys: keys,
          onChange,
        }),
      ),
    );
  await show("a", ["a", "b"]);
  act(() => editor().dispatch({ changes: { from: 0, insert: "old " } }));
  expect(onChange).toHaveBeenLastCalledWith("old original", "a");
  await show("b", ["b"]);
  await show("a", ["a", "b"]);
  expect(editor().state.sliceDoc()).toBe("original");
  expect(undo(editor())).toBe(false);
});

it("switches open tabs in the existing editor without waiting for highlighting", async () => {
  const onReady = vi.fn().mockResolvedValue(undefined);
  const show = (key: string) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: `${key}.ts`,
          initialValue: `// ${key}`,
          documentKey: key,
          openDocumentKeys: ["a", "b"],
          onReady,
        }),
      ),
    );
  await show("a");
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith("a"));
  const first = editor();
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => new Promise(() => {}),
  } as unknown as LanguageDescription);
  await show("b");
  expect(editor()).toBe(first);
  expect(editor().state.doc.toString()).toBe("// b");
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith("b"));
  await show("a");
  expect(editor()).toBe(first);
  expect(onReady.mock.lastCall).toEqual(["a"]);
});

it("reports focus and selection to native without editing the document", async () => {
  const onInteractionChange = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        documentKey: "one",
        filename: "notes.txt",
        initialValue: "hello",
        onInteractionChange,
        onChange,
      }),
    ),
  );
  act(() => {
    editor().focus();
    editor().dispatch({ selection: { anchor: 0, head: 3 } });
  });
  expect(onInteractionChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ focused: true, hasSelection: true }),
    "one",
  );
  act(() => editor().dispatch({ selection: { anchor: 3 } }));
  expect(onInteractionChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ focused: true, hasSelection: false }),
    "one",
  );
  expect(onChange).not.toHaveBeenCalled();
});

it("restores selection UI for the new document and reserves space above the keyboard strip", async () => {
  const onInteractionChange = vi.fn().mockResolvedValue(undefined);
  const showDocument = (documentKey: string) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          documentKey,
          filename: "notes.txt",
          initialValue: "hello",
          openDocumentKeys: ["one", "two"],
          onInteractionChange,
          keyboardAccessoryHeight: 96,
          bottomInset: 180,
        }),
      ),
    );
  await showDocument("one");
  act(() => {
    editor().focus();
    editor().dispatch({ selection: { anchor: 0, head: 3 } });
  });
  await showDocument("two");
  expect(onInteractionChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ focused: true, hasSelection: false }),
    "two",
  );
  await showDocument("one");
  expect(onInteractionChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ focused: true, hasSelection: true }),
    "one",
  );
  expect(
    (
      container.querySelector(".code-editor-shell") as HTMLElement
    ).style.getPropertyValue("--editor-bottom-inset"),
  ).toBe("108px");
});

it("dismisses the WebView keyboard by blurring the editor without losing its selection or edits", async () => {
  const ref = createRef<CodeEditorRef>();
  const onChange = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "notes.txt",
        initialValue: "hello",
        onChange,
      }),
    ),
  );
  act(() => editor().dispatch({ selection: { anchor: 1, head: 4 } }));
  act(() => editor().focus());
  expect(document.activeElement).toBe(editor().contentDOM);
  act(() => ref.current!.dismissKeyboard());
  expect(document.activeElement).not.toBe(editor().contentDOM);
  expect(editor().state.selection.main).toMatchObject({ from: 1, to: 4 });
  expect(editor().state.doc.toString()).toBe("hello");
  expect(onChange).not.toHaveBeenCalled();
  act(() => editor().focus());
  expect(document.activeElement).toBe(editor().contentDOM);
});

it("reconfigures editing preferences without losing text, selection or undo", async () => {
  const { defaultEditorPreferences } =
    await import("@/features/settings/constants");
  const props = {
    filename: "notes.txt",
    initialValue: "first\nsecond",
    preferences: defaultEditorPreferences,
  };
  await act(async () => root.render(createElement(CodeEditor, props)));
  const view = editor();
  act(() =>
    view.dispatch({
      changes: { from: 0, insert: "edit " },
      selection: { anchor: 3 },
    }),
  );
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ...props,
        preferences: {
          ...defaultEditorPreferences,
          fontSize: 24,
          tabSize: 8,
          lineNumbers: false,
          wordWrap: true,
          useTabs: true,
          keepIndentation: false,
        },
      }),
    ),
  );
  expect(editor()).toBe(view);
  expect(view.state.tabSize).toBe(8);
  expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
  expect(container.querySelector(".cm-lineNumbers")).toBeNull();
  expect(view.state.selection.main.head).toBe(3);
  act(() => undo(view));
  expect(view.state.doc.toString()).toBe(props.initialValue);
});

it("routes native search commands to the active document and rejects stale tab commands", async () => {
  const ref = createRef<CodeEditorRef>();
  const onSearchSummary = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "test.txt",
        documentKey: "active",
        initialValue: "x x",
        onSearchSummary,
      }),
    ),
  );
  act(() =>
    ref.current!.searchCommand(
      "replace-all",
      { search: "x", replace: "y" },
      "old",
    ),
  );
  expect(editor().state.doc.toString()).toBe("x x");
  act(() =>
    ref.current!.searchCommand(
      "replace-all",
      { search: "x", replace: "y" },
      "active",
    ),
  );
  expect(editor().state.doc.toString()).toBe("y y");
  expect(onSearchSummary).toHaveBeenLastCalledWith(
    expect.objectContaining({ total: 0 }),
    "active",
  );
});

it("applies global preferences to restored tabs without replacing their edits or undo history", async () => {
  const { defaultEditorPreferences } =
    await import("@/features/settings/constants");
  const changed = {
    ...defaultEditorPreferences,
    tabSize: 8,
    lineNumbers: false,
    wordWrap: true,
  };
  const show = (key: string, preferences: typeof defaultEditorPreferences) =>
    act(async () =>
      root.render(
        createElement(CodeEditor, {
          filename: `${key}.txt`,
          initialValue: "original",
          documentKey: key,
          openDocumentKeys: ["a", "b"],
          preferences,
        }),
      ),
    );
  await show("a", defaultEditorPreferences);
  act(() =>
    editor().dispatch({
      changes: { from: 0, insert: "edit " },
      selection: { anchor: 2 },
    }),
  );
  await show("b", defaultEditorPreferences);
  await show("b", changed);
  await show("a", changed);
  expect(editor().state.tabSize).toBe(8);
  expect(editor().contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
  expect(container.querySelector(".cm-lineNumbers")).toBeNull();
  expect(editor().state.sliceDoc()).toBe("edit original");
  expect(editor().state.selection.main.anchor).toBe(2);
  act(() => undo(editor()));
  expect(editor().state.sliceDoc()).toBe("original");
});

it("automatically formats the active file after changing indentation preferences", async () => {
  const { defaultEditorPreferences } =
    await import("@/features/settings/constants");
  const props = {
    filename: "main.ts",
    documentKey: "main",
    initialValue: "function x(){return 1}",
    preferences: defaultEditorPreferences,
  };
  await act(async () => root.render(createElement(CodeEditor, props)));
  expect(editor().state.sliceDoc()).toBe(props.initialValue);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ...props,
        preferences: { ...defaultEditorPreferences, tabSize: 4 },
      }),
    ),
  );
  await vi.waitFor(() =>
    expect(editor().state.sliceDoc()).toContain("\n    return 1;\n"),
  );
  act(() => undo(editor()));
  expect(editor().state.sliceDoc()).toBe(props.initialValue);
});
it("captures exact live selection and accepts only the completed rendered preview at the captured revision", async () => {
  const ref = createRef<CodeEditorRef>();
  const onContext = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onSuggestionApplied = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "test.txt",
        documentKey: "doc",
        initialValue: "hello",
        onContext,
        onChange,
        onSuggestionApplied,
      }),
    ),
  );
  act(() => editor().dispatch({ selection: { anchor: 1, head: 4 } }));
  act(() => ref.current!.captureContext("capture"));
  const captured = onContext.mock.lastCall![1];
  expect(captured).toMatchObject({
    content: "hello",
    from: 1,
    to: 4,
    documentKey: "doc",
  });
  const preview = {
    id: "p",
    from: 1,
    to: 4,
    status: "generating" as const,
    text: "i",
    transcript: "replace this",
  };
  act(() => ref.current!.previewSuggestion(preview, "doc", captured.revision));
  expect(editor().state.doc.toString()).toBe("hio");
  expect(container.querySelector(".cm-voice-changed")!.textContent).toBe("i");
  expect(onChange).toHaveBeenCalledExactlyOnceWith("hio", "doc");
  act(() => ref.current!.acceptSuggestion("p", "doc", captured.revision));
  expect(onSuggestionApplied).toHaveBeenLastCalledWith("p", false);
  act(() =>
    ref.current!.previewSuggestion(
      { ...preview, status: "ready" },
      "doc",
      captured.revision,
    ),
  );
  act(() => ref.current!.acceptSuggestion("p", "doc", captured.revision));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("hio", "doc");
  expect(onSuggestionApplied).toHaveBeenLastCalledWith("p", true);
  act(() => undo(editor()));
  expect(editor().state.doc.toString()).toBe("hello");
  act(() =>
    ref.current!.previewSuggestion(
      { ...preview, status: "ready" },
      "doc",
      captured.revision,
    ),
  );
  expect(container.querySelector(".cm-voice-suggestion")).toBeNull();
});

it("saves streamed chunks and rolls back when declined or leaving the tab", async () => {
  const ref = createRef<CodeEditorRef>();
  const onContext = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onInteractionChange = vi.fn().mockResolvedValue(undefined);
  const onSuggestionAction = vi.fn(async (_id, action) => {
    if (action === "decline") ref.current!.previewSuggestion(null, "doc", 0);
  });
  const props = {
    ref,
    filename: "a.txt",
    documentKey: "doc",
    initialValue: "hello",
    onContext,
    onChange,
    onInteractionChange,
    onSuggestionAction,
  };
  await act(async () => root.render(createElement(CodeEditor, props)));
  act(() => ref.current!.captureContext("capture"));
  const revision = onContext.mock.lastCall![1].revision;
  const value = {
    id: "edit",
    from: 1,
    to: 4,
    text: "i",
    status: "generating" as const,
    transcript: "",
  };
  act(() => ref.current!.previewSuggestion(value, "doc", revision));
  expect(onInteractionChange.mock.lastCall![0]).toMatchObject({
    inlineSuggestionId: "edit",
  });
  act(() =>
    ref.current!.previewSuggestion(
      { ...value, text: "ey", status: "ready" },
      "doc",
      revision,
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith("heyo", "doc");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Decline suggestion"]')!
      .click(),
  );
  expect(onSuggestionAction).toHaveBeenCalledWith("edit", "decline");
  expect(onChange).toHaveBeenLastCalledWith("hello", "doc");
  act(() => ref.current!.captureContext("again"));
  const nextRevision = onContext.mock.lastCall![1].revision;
  act(() =>
    ref.current!.previewSuggestion(
      { ...value, id: "next" },
      "doc",
      nextRevision,
    ),
  );
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ...props,
        filename: "b.txt",
        documentKey: "other",
        initialValue: "other",
      }),
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith("hello", "doc");
  await act(async () => root.render(createElement(CodeEditor, props)));
  expect(editor().state.doc.toString()).toBe("hello");
  expect(container.querySelector(".cm-voice-actions")).toBeNull();
});

it("syntax highlights streamed code and accepts through the visible button", async () => {
  const ref = createRef<CodeEditorRef>();
  const onContext = vi.fn().mockResolvedValue(undefined);
  const onSuggestionApplied = vi.fn().mockResolvedValue(undefined);
  let revision = 0;
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        filename: "inline.ts",
        documentKey: "doc",
        initialValue: "",
        onContext,
        onSuggestionApplied,
        onSuggestionAction: async (id, action) => {
          if (action === "accept")
            ref.current!.acceptSuggestion(id, "doc", revision);
        },
      }),
    ),
  );
  act(() => ref.current!.captureContext("capture"));
  revision = onContext.mock.lastCall![1].revision;
  act(() =>
    ref.current!.previewSuggestion(
      {
        id: "edit",
        from: 0,
        to: 0,
        text: "export const answer = 42;",
        transcript: "",
        status: "ready",
      },
      "doc",
      revision,
    ),
  );
  await vi.waitFor(() =>
    expect(container.querySelector(".cm-voice-changed span")).not.toBeNull(),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Accept suggestion"]')!
      .click(),
  );
  expect(onSuggestionApplied).toHaveBeenLastCalledWith("edit", true);
  expect(editor().state.doc.toString()).toBe("export const answer = 42;");
  expect(container.querySelector(".cm-voice-actions")).toBeNull();
  expect(editor().state.readOnly).toBe(false);
});

it("restores focus through the native bridge without moving the caret or focusing a stale document", async () => {
  const ref = createRef<CodeEditorRef>();
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ref,
        documentKey: "doc",
        filename: "notes.txt",
        initialValue: "hello",
      }),
    ),
  );
  const view = editor();
  act(() => view.dispatch({ selection: { anchor: 3 } }));
  act(() => ref.current!.focus("stale"));
  expect(view.hasFocus).toBe(false);
  act(() => ref.current!.focus("doc"));
  expect(view.hasFocus).toBe(true);
  expect(view.state.selection.main.head).toBe(3);
  expect(view.state.doc.toString()).toBe("hello");
});

it("shows an explanation highlight without changing selection or source and removes it on dismissal", async () => {
  const ref = createRef<CodeEditorRef>();
  const onContext = vi.fn().mockResolvedValue(undefined);
  const props = {
    ref,
    filename: "explain.ts",
    documentKey: "explain",
    initialValue: "const x = 1;",
    onContext,
  };
  await act(async () => root.render(createElement(CodeEditor, props)));
  act(() => ref.current!.captureContext("before"));
  const original = onContext.mock.lastCall![1];
  await act(async () =>
    root.render(
      createElement(CodeEditor, {
        ...props,
        explanationRange: {
          documentKey: "explain",
          revision: original.revision,
          from: 6,
          to: 7,
        },
      }),
    ),
  );
  expect(
    container.querySelector(".cm-explanation-highlight")?.textContent,
  ).toBe("x");
  act(() => ref.current!.captureContext("after"));
  expect(onContext.mock.lastCall![1]).toMatchObject({
    content: original.content,
    from: original.from,
    to: original.to,
  });
  await act(async () =>
    root.render(
      createElement(CodeEditor, { ...props, explanationRange: null }),
    ),
  );
  expect(container.querySelector(".cm-explanation-highlight")).toBeNull();
});
