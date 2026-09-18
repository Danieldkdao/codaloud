"use dom";

import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import {
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search } from "@codemirror/search";
import { forceLinting, openLintPanel } from "@codemirror/lint";
import { createCodeEditorIntelligence, refreshCodeAnalysis, type CodeEditorAnalysis, type CodeEditorAnalysisRequest } from "./code-editor-intelligence";
import { CODE_INTELLIGENCE_FILE_PATTERN } from "@/features/projects/constants";
import { tags } from "@lezer/highlight";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";

import { useDOMImperativeHandle, type DOMImperativeFactory } from "expo/dom";
import { codeEditorMatches, getCodeEditorMatchState, moveCodeEditorMatch, scrollToActiveCodeEditorMatch, setCodeEditorMatches, type CodeEditorMatchState } from "./code-editor-matches";

import "@/global.css";
import "@/styles/code-editor.css";

export interface CodeEditorRef extends DOMImperativeFactory {
  flushChanges: () => Promise<void>;
  nextMatch: () => void;
  previousMatch: () => void;
}

type CodeEditorProps = {
  ref?: Ref<CodeEditorRef>;
  /** Literal, case-insensitive search terms. Matching runs against the live document. */
  matches?: string[];
  onMatchesChange?: (state: CodeEditorMatchState) => Promise<void>;
  documentKey?: string;
  openDocumentKeys?: string[];
  filename: string;
  /** Initial text for this document. Live edits stay inside CodeMirror. */
  initialValue: string;
  /** Disables user edits while preserving selection, copying, and navigation. */
  readOnly?: boolean;
  bottomInset?: number;
  /** DOM components have a separate React tree, so appearance crosses as a prop. */
  colorScheme?: "light" | "dark";
  /** Signals that CodeMirror has finished its initial layout. */
  onReady?: (documentKey?: string) => Promise<void>;
  onChange?: (content: string, documentKey?: string) => Promise<void>;
  onRequestAnalysis?: (input: Parameters<CodeEditorAnalysisRequest>[0], documentKey?: string) => ReturnType<CodeEditorAnalysisRequest>;
  onAnalysis?: (analysis: CodeEditorAnalysis, documentKey?: string) => Promise<void>;
  analysisPanelRequest?: number;
  dom?: import("expo/dom").DOMProps;
};

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.meta],
    color: "var(--syntax-keyword)",
    fontWeight: "600",
  },
  { tag: [tags.string, tags.regexp, tags.inserted], color: "var(--syntax-string)" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.escape],
    color: "var(--syntax-number)",
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
    fontWeight: "600",
  },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--syntax-property)" },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: [tags.tagName, tags.deleted], color: "var(--syntax-tag)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.heading, tags.link], color: "var(--syntax-function)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

const formatEditorThemeClassName = (colorScheme: CodeEditorProps["colorScheme"]) => {
  switch (colorScheme) {
    case "dark": return "code-editor-shell theme-dark";
    case "light": return "code-editor-shell theme-light";
    default: return "code-editor-shell";
  }
};

const CodeEditor = ({
  ref,
  matches,
  onMatchesChange,
  filename,
  documentKey,
  openDocumentKeys,
  initialValue,
  readOnly = false,
  bottomInset = 0,
  colorScheme,
  onReady,
  onChange,
  onRequestAnalysis,
  onAnalysis,
  analysisPanelRequest = 0,
}: CodeEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  const buffers = useRef(new Map<string, { state: EditorState; top: number; left: number }>());
  const openKeys = useRef(openDocumentKeys);
  openKeys.current = openDocumentKeys;
  const pendingChanges = useRef(new Set<Promise<void>>());
  useEffect(() => {
    if (openDocumentKeys) for (const key of buffers.current.keys()) {
      if (!openDocumentKeys.includes(key)) buffers.current.delete(key);
    }
  }, [openDocumentKeys]);
  const matchesKey = JSON.stringify(matches ?? []);
  const matchesCallback = useRef(onMatchesChange);
  matchesCallback.current = onMatchesChange;
  const reportedMatches = useRef<CodeEditorMatchState | null>(null);
  const view = useRef<EditorView | null>(null);
  const [editability] = useState(() => new Compartment());
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const inset = useRef(bottomInset);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const changeCallback = useRef(onChange);
  changeCallback.current = onChange;
  const analysisCallbacks = useRef({ onRequestAnalysis, onAnalysis });
  analysisCallbacks.current = { onRequestAnalysis, onAnalysis };
  const hasAnalysis = Boolean(onRequestAnalysis) && CODE_INTELLIGENCE_FILE_PATTERN.test(filename);
  const analysisStatus = useRef<CodeEditorAnalysis["status"]>("checking");
  const pendingProblemsPanel = useRef(false);
  const notifiedEditor = useRef<EditorView | null>(null);
  const [preparedEditor, setPreparedEditor] = useState<EditorView | null>(null);
  const [languageError, setLanguageError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    EditorMono: JetBrainsMono_400Regular,
    EditorUI: Outfit_400Regular,
  });
  const effectiveInset = keyboardVisible ? 12 : bottomInset + 16;
  inset.current = effectiveInset;

  useDOMImperativeHandle(ref ?? null, () => ({
    flushChanges: async () => {
      while (pendingChanges.current.size) await Promise.all([...pendingChanges.current]);
    },
    nextMatch: () => { if (view.current) moveCodeEditorMatch(view.current, 1); },
    previousMatch: () => { if (view.current) moveCodeEditorMatch(view.current, -1); },
  }), []);

  const reportMatches = (editor: EditorView) => {
    const summary = getCodeEditorMatchState(editor);
    if (summary.total === reportedMatches.current?.total && summary.activeIndex === reportedMatches.current?.activeIndex) return;
    reportedMatches.current = summary;
    void matchesCallback.current?.(summary).catch((error: unknown) => {
      console.warn("Unable to report editor matches", error);
    });
  };

  useEffect(() => {
    if (!host.current) return;
    const language = new Compartment();
    let disposed = false;
    analysisStatus.current = hasAnalysis ? "checking" : "unsupported";
    pendingProblemsPanel.current = false;
    const intelligence = hasAnalysis ? createCodeEditorIntelligence(
      filename,
      async (input) => analysisCallbacks.current.onRequestAnalysis?.(input, documentKey) ?? null,
      (analysis) => {
        analysisStatus.current = analysis.status;
        void (documentKey ? analysisCallbacks.current.onAnalysis?.(analysis, documentKey) : analysisCallbacks.current.onAnalysis?.(analysis))?.catch(() => {});
        if (analysis.status === "ready" && pendingProblemsPanel.current) {
          pendingProblemsPanel.current = false;
          requestAnimationFrame(() => { if (!disposed && view.current === editor) openLintPanel(editor); });
        }
      },
    ) : null;
    const extensions = [
        basicSetup,
        codeEditorMatches,
        editability.of([
          EditorState.readOnly.of(readOnlyRef.current),
          EditorView.editable.of(!readOnlyRef.current),
        ]),
        intelligence?.extensions ?? [],
        search({ top: true }),
        EditorState.tabSize.of(2),
        // Preserve the file's newline convention when sending edits to native.
        initialValue.includes("\r\n") ? EditorState.lineSeparator.of("\r\n") : [],
        EditorView.updateListener.of((update) => {
          if (update.startState.field(codeEditorMatches) !== update.state.field(codeEditorMatches)) reportMatches(update.view);
          if (update.docChanged) {
            const pending = documentKey
              ? changeCallback.current?.(update.state.sliceDoc(), documentKey)
              : changeCallback.current?.(update.state.sliceDoc());
            if (pending) {
              pendingChanges.current.add(pending);
              void pending.catch((error: unknown) => {
                console.warn("Unable to report editor changes", error);
              }).finally(() => pendingChanges.current.delete(pending));
            }
          }
        }),
        syntaxHighlighting(highlightStyle),
        language.of([]),
        EditorView.contentAttributes.of((editor) => ({
          "aria-label": `${filename} code editor`,
          "aria-readonly": String(editor.state.readOnly),
          // Keep selection and hardware-keyboard navigation available without contenteditable.
          tabindex: "0",
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: "false",
        })),
        EditorView.scrollMargins.of(() => ({ bottom: inset.current })),
      ];
    const buffer = documentKey ? buffers.current.get(documentKey) : undefined;
    const editor = new EditorView({
      parent: host.current,
      state: buffer
        ? buffer.state.update({ effects: [StateEffect.reconfigure.of(extensions), editability.reconfigure([EditorState.readOnly.of(readOnlyRef.current), EditorView.editable.of(!readOnlyRef.current)])] }).state
        : EditorState.create({ doc: initialValue, extensions }),
    });
    if (buffer) {
      editor.scrollDOM.scrollTop = buffer.top;
      editor.scrollDOM.scrollLeft = buffer.left;
    }
    view.current = editor;
    reportedMatches.current = null;
    if (!hasAnalysis) void analysisCallbacks.current.onAnalysis?.({ status: "unsupported", diagnostics: [] }, documentKey).catch(() => {});
    const description = LanguageDescription.matchFilename(languages, filename);
    setLanguageError(false);
    const languageSetup = description
      ?.load()
      .then((support) => {
        if (!disposed)
          editor.dispatch({ effects: language.reconfigure(support) });
      })
      .catch(() => {
        if (!disposed) {
          setLanguageError(true);
        }
      });
    void Promise.resolve(languageSetup).then(() => {
      if (!disposed) setPreparedEditor(editor);
    });
    return () => {
      disposed = true;
      if (documentKey && (!openKeys.current || openKeys.current.includes(documentKey))) {
        buffers.current.set(documentKey, { state: editor.state, top: editor.scrollDOM.scrollTop, left: editor.scrollDOM.scrollLeft });
      }
      intelligence?.destroy();
      editor.destroy();
      view.current = null;
    };
  }, [filename, initialValue, hasAnalysis, editability, documentKey]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: setCodeEditorMatches.of(JSON.parse(matchesKey) as string[]) });
    reportMatches(editor);
    scrollToActiveCodeEditorMatch(editor);
  }, [matchesKey, filename, initialValue, hasAnalysis, documentKey]);

  useEffect(() => {
    // Reconfigure in place so switching modes preserves document and undo state.
    view.current?.dispatch({
      effects: editability.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly, editability]);

  useEffect(() => {
    if (analysisPanelRequest && view.current && hasAnalysis) {
      if (analysisStatus.current === "ready") openLintPanel(view.current);
      else {
        pendingProblemsPanel.current = true;
        view.current.dispatch({ effects: refreshCodeAnalysis.of(null) });
        forceLinting(view.current);
      }
    }
  }, [analysisPanelRequest, hasAnalysis]);

  useEffect(() => {
    if (
      (!fontsLoaded && !fontError) ||
      !preparedEditor ||
      preparedEditor !== view.current
    ) return;
    let disposed = false;
    // Wait for CodeMirror's measured layout, not just the WebView load event.
    preparedEditor.requestMeasure({
      read: () => undefined,
      write: () => {
        if (disposed || notifiedEditor.current === preparedEditor) return;
        notifiedEditor.current = preparedEditor;
        requestAnimationFrame(() => {
          if (!disposed && view.current === preparedEditor) scrollToActiveCodeEditorMatch(preparedEditor);
        });
        void readyCallback.current?.(documentKey).catch((error: unknown) => {
          console.warn("Unable to report editor readiness", error);
        });
      },
    });
    return () => {
      disposed = true;
    };
  }, [preparedEditor, fontsLoaded, fontError]);

  useEffect(() => {
    // The visual viewport shrinks for the software keyboard in a native WebView.
    const viewport = window.visualViewport;
    const resize = () => {
      setViewportHeight(viewport?.height ?? window.innerHeight);
      setKeyboardVisible(
        (viewport?.height ?? window.innerHeight) < window.innerHeight - 100,
      );
      view.current?.requestMeasure();
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    editor?.requestMeasure();
    if (editor?.hasFocus) {
      editor.dispatch({
        effects: EditorView.scrollIntoView(editor.state.selection.main.head),
      });
    }
  }, [effectiveInset, viewportHeight, fontsLoaded]);

  return (
    <section
      className={formatEditorThemeClassName(colorScheme)}
      data-theme={colorScheme}
      aria-label="Code panel"
      style={
        {
          height: viewportHeight ?? "100%",
          colorScheme,
          "--editor-bottom-inset": `${effectiveInset}px`,
        } as CSSProperties
      }
    >
      {languageError ? (
        <div role="status" className="code-editor-notice">
          Highlighting unavailable.
        </div>
      ) : null}
      <div ref={host} className="code-editor-host" />
    </section>
  );
};

export default CodeEditor;
