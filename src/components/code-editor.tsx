"use dom";

import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import {
  HighlightStyle,
  codeFolding,
  bracketMatching,
  defaultHighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  createCodeEditorIntelligence,
  type CodeEditorAnalysis,
  type CodeEditorAnalysisRequest,
} from "./code-editor-intelligence";
import { CODE_INTELLIGENCE_FILE_PATTERN } from "@/features/projects/constants";
import { tags } from "@lezer/highlight";
import { editorFontAssets } from "@/features/editor/fonts";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { useFonts } from "expo-font";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";

import { useDOMImperativeHandle, type DOMImperativeFactory } from "expo/dom";
import {
  codeEditorMatches,
  getCodeEditorMatchState,
  moveCodeEditorMatch,
  scrollToActiveCodeEditorMatch,
  setCodeEditorMatches,
  type CodeEditorMatchState,
} from "./code-editor-matches";

import { editorAutocompletion } from "@/features/editor/completions";
import { inlineDiagnostics } from "@/features/editor/diagnostics";
import { transformEditor } from "@/features/editor/transforms";
import type { CodeIntelligenceOperation } from "@/features/projects/actions/code-intelligence-schemas";
import {
  editorSearch,
  updateEditorSearch,
  runSearchCommand,
  getEditorSearchSummary,
} from "@/features/editor/search";
import type {
  EditorSearchCommand,
  EditorSearchQuery,
  EditorSearchSummary,
} from "@/features/editor/types";
import {
  getEditorCommandState,
  runEditorCommand,
} from "@/features/editor/commands";
import type {
  EditorCommand,
  EditorCommandState,
} from "@/features/editor/types";
import { editorConfiguration } from "@/features/editor/configuration";
import { defaultEditorPreferences } from "@/features/settings/constants";
import type { EditorPreferences } from "@/features/settings/types";
import {
  formatEditorThemeClass,
  formatEditorFontFamily,
} from "@/features/editor/lib/formatters";
// The shared cn module imports native Alert and cannot load inside Expo DOM.
import { clsx } from "clsx";
import "@/global.css";
import "@/styles/code-editor.css";

export type CodeEditorRef = {
  revealDiagnostic(
    from: number,
    to: number,
    revision: number,
    documentKey: string,
  ): void;
  transform(operation: CodeIntelligenceOperation, documentKey: string): void;
  searchCommand(
    command: EditorSearchCommand,
    query: EditorSearchQuery,
    documentKey: string,
  ): void;
  command(command: EditorCommand, text: string, documentKey: string): void;
  flushChanges(requestId?: string): Promise<void>;
  nextMatch: () => void;
  previousMatch: () => void;
  dismissKeyboard: () => void;
};

export type CodeEditorInteraction = {
  focused: boolean;
  hasSelection: boolean;
  commands?: EditorCommandState;
};

type CodeEditorProps = {
  searchQuery?: EditorSearchQuery;
  onSearchSummary?: (
    summary: EditorSearchSummary,
    documentKey?: string,
  ) => Promise<void>;
  onFlushed?: (requestId: string, error: string | null) => Promise<void>;
  onCommandError?: (message: string) => Promise<void>;
  onReadClipboard?: () => Promise<string>;
  onWriteClipboard?: (text: string) => Promise<void>;
  preferences?: EditorPreferences;
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
  keyboardAccessoryHeight?: number;
  onInteractionChange?: (
    state: CodeEditorInteraction,
    documentKey?: string,
  ) => Promise<void>;
  /** DOM components have a separate React tree, so appearance crosses as a prop. */
  colorScheme?: "light" | "dark";
  /** Signals that CodeMirror has finished its initial layout. */
  onReady?: (documentKey?: string) => Promise<void>;
  onChange?: (content: string, documentKey?: string) => Promise<void>;
  onRequestAnalysis?: (
    input: Parameters<CodeEditorAnalysisRequest>[0],
    documentKey?: string,
  ) => ReturnType<CodeEditorAnalysisRequest>;
  onAnalysis?: (
    analysis: CodeEditorAnalysis,
    documentKey?: string,
  ) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
};

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.meta],
    color: "var(--syntax-keyword)",
    fontFamily: "var(--editor-font-semibold)",
  },
  {
    tag: [tags.string, tags.regexp, tags.inserted],
    color: "var(--syntax-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.escape],
    color: "var(--syntax-number)",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "var(--syntax-type)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
    fontFamily: "var(--editor-font-semibold)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syntax-property)",
  },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: [tags.tagName, tags.deleted], color: "var(--syntax-tag)" },
  {
    tag: tags.comment,
    color: "var(--syntax-comment)",
    fontFamily: "var(--editor-font-italic)",
  },
  {
    tag: [tags.heading, tags.link],
    color: "var(--syntax-function)",
    textDecoration: "underline",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

const formatEditorThemeClassName = (
  colorScheme: CodeEditorProps["colorScheme"],
) => {
  switch (colorScheme) {
    case "dark":
      return "code-editor-shell theme-dark";
    case "light":
      return "code-editor-shell theme-light";
    default:
      return "code-editor-shell";
  }
};

const CodeEditor = ({
  preferences = defaultEditorPreferences,
  searchQuery,
  onSearchSummary,
  onFlushed,
  onCommandError,
  onReadClipboard,
  onWriteClipboard,
  ref,
  matches,
  onMatchesChange,
  filename,
  documentKey,
  openDocumentKeys,
  initialValue,
  readOnly = false,
  bottomInset = 0,
  keyboardAccessoryHeight = 0,
  onInteractionChange,
  colorScheme,
  onReady,
  onChange,
  onRequestAnalysis,
  onAnalysis,
}: CodeEditorProps) => {
  const lastSearchSummary = useRef("");
  const searchCallback = useRef(onSearchSummary);
  searchCallback.current = onSearchSummary;
  const searchQueryKey = JSON.stringify(searchQuery ?? { search: "" });
  const flushCallback = useRef(onFlushed);
  flushCallback.current = onFlushed;
  const clipboard = useRef({
    onReadClipboard,
    onWriteClipboard,
    onCommandError,
  });
  clipboard.current = { onReadClipboard, onWriteClipboard, onCommandError };
  const activeFilename = useRef(filename);
  activeFilename.current = filename;
  const revision = useRef(0);
  const transformPending = useRef(false);
  const activeDocument = useRef(documentKey);
  activeDocument.current = documentKey;
  const host = useRef<HTMLDivElement>(null);
  const interactionCallback = useRef(onInteractionChange);
  interactionCallback.current = onInteractionChange;
  const reportedInteraction = useRef<
    (CodeEditorInteraction & { key?: string }) | null
  >(null);
  const buffers = useRef(
    new Map<string, { state: EditorState; top: number; left: number }>(),
  );
  const openKeys = useRef(openDocumentKeys);
  openKeys.current = openDocumentKeys;
  const pendingChanges = useRef(new Set<Promise<void>>());
  useEffect(() => {
    if (openDocumentKeys)
      for (const key of buffers.current.keys()) {
        if (!openDocumentKeys.includes(key)) buffers.current.delete(key);
      }
  }, [openDocumentKeys]);
  const matchesKey = JSON.stringify(matches ?? []);
  const matchesCallback = useRef(onMatchesChange);
  matchesCallback.current = onMatchesChange;
  const reportedMatches = useRef<CodeEditorMatchState | null>(null);
  const view = useRef<EditorView | null>(null);
  const [configuration] = useState(() => new Compartment());
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
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
  const hasAnalysis =
    Boolean(onRequestAnalysis) && CODE_INTELLIGENCE_FILE_PATTERN.test(filename);
  const notifiedEditor = useRef<object | null>(null);
  const [preparedEditor, setPreparedEditor] = useState<{
    editor: EditorView;
    key?: string;
  } | null>(null);
  const fontsReady = useRef(false);
  const [languageError, setLanguageError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    ...editorFontAssets,
    EditorUI: Outfit_400Regular,
  });
  fontsReady.current = Boolean(fontsLoaded || fontError);
  const effectiveInset =
    keyboardAccessoryHeight > 0
      ? keyboardAccessoryHeight + 12
      : keyboardVisible
        ? 12
        : bottomInset + 16;
  inset.current = effectiveInset;

  useDOMImperativeHandle(
    // Expo’s bridge index signature accepts arbitrary JSON, while callers use
    // the narrower serializable command contract above.
    (ref ?? null) as Ref<DOMImperativeFactory>,
    () =>
      ({
        revealDiagnostic: (
          from: number,
          to: number,
          expectedRevision: number,
          key: string,
        ) => {
          const editor = view.current;
          if (!editor || key !== activeDocument.current) return;
          if (
            expectedRevision !== revision.current ||
            from < 0 ||
            to > editor.state.doc.length
          ) {
            void clipboard.current
              .onCommandError?.(
                "This problem changed. Wait for analysis and select it again.",
              )
              .catch(() => {});
            return;
          }
          editor.dispatch({
            selection: { anchor: from, head: to },
            effects: EditorView.scrollIntoView(from, { y: "center" }),
          });
        },
        transform: (operation: CodeIntelligenceOperation, key: string) => {
          const editor = view.current;
          if (
            !editor ||
            key !== activeDocument.current ||
            transformPending.current
          )
            return;
          transformPending.current = true;
          void transformEditor(
            editor,
            activeFilename.current,
            operation,
            preferencesRef.current,
            async (input) =>
              analysisCallbacks.current.onRequestAnalysis?.(input, key) ?? null,
            () => view.current === editor && activeDocument.current === key,
          )
            .catch((error: unknown) => {
              void clipboard.current
                .onCommandError?.(
                  error instanceof Error ? error.message : "Try again.",
                )
                .catch(() => {});
            })
            .finally(() => {
              transformPending.current = false;
            });
        },
        searchCommand: (
          command: EditorSearchCommand,
          query: EditorSearchQuery,
          key: string,
        ) => {
          if (!view.current || key !== activeDocument.current) return;
          updateEditorSearch(view.current, query);
          runSearchCommand(view.current, command);
        },
        command: (command: EditorCommand, text: string, key: string) => {
          const editor = view.current;
          if (!editor || (key !== undefined && key !== activeDocument.current))
            return;
          void runEditorCommand(
            editor,
            command,
            {
              read: async () => {
                if (!clipboard.current.onReadClipboard)
                  throw new Error("Clipboard unavailable.");
                return clipboard.current.onReadClipboard();
              },
              write: async (value) => {
                if (!clipboard.current.onWriteClipboard)
                  throw new Error("Clipboard unavailable.");
                await clipboard.current.onWriteClipboard(value);
              },
            },
            text,
            () => view.current === editor && activeDocument.current === key,
          )
            .then(() => {
              if (editor === view.current)
                reportInteraction(editor, activeDocument.current);
            })
            .catch((error: unknown) => {
              void clipboard.current
                .onCommandError?.(
                  error instanceof Error ? error.message : "Try again.",
                )
                .catch(() => {});
            });
        },
        flushChanges: async (requestId?: string) => {
          try {
            while (pendingChanges.current.size)
              await Promise.all([...pendingChanges.current]);
            if (requestId) await flushCallback.current?.(requestId, null);
          } catch (error) {
            if (requestId)
              await flushCallback.current?.(
                requestId,
                error instanceof Error
                  ? error.message
                  : "Changes could not be delivered.",
              );
            else throw error;
          }
        },
        dismissKeyboard: () => {
          // Native Keyboard.dismiss only blurs registered React Native inputs.
          // Release the WebView's contenteditable focus to close its keyboard.
          view.current?.contentDOM.blur();
        },
        nextMatch: () => {
          if (view.current) moveCodeEditorMatch(view.current, 1);
        },
        previousMatch: () => {
          if (view.current) moveCodeEditorMatch(view.current, -1);
        },
      }) as unknown as DOMImperativeFactory,
    [],
  );

  const reportInteraction = (editor: EditorView, key?: string) => {
    const state = {
      commands: getEditorCommandState(editor),
      focused: editor.hasFocus,
      hasSelection: !editor.state.selection.main.empty,
    };
    const previous = reportedInteraction.current;
    if (
      previous &&
      previous.key === key &&
      JSON.stringify(previous.commands) === JSON.stringify(state.commands) &&
      previous.focused === state.focused &&
      previous.hasSelection === state.hasSelection
    )
      return;
    reportedInteraction.current = { ...state, key };
    void interactionCallback.current?.(state, key).catch(() => {});
  };

  const reportMatches = (editor: EditorView) => {
    const summary = getCodeEditorMatchState(editor);
    if (
      summary.total === reportedMatches.current?.total &&
      summary.activeIndex === reportedMatches.current?.activeIndex
    )
      return;
    reportedMatches.current = summary;
    void matchesCallback.current?.(summary).catch((error: unknown) => {
      console.warn("Unable to report editor matches", error);
    });
  };

  useEffect(() => {
    if (!host.current) return;
    const language = new Compartment();
    let disposed = false;
    const intelligence = hasAnalysis
      ? createCodeEditorIntelligence(
          filename,
          async (input) =>
            analysisCallbacks.current.onRequestAnalysis?.(input, documentKey) ??
            null,
          (analysis) => {
            analysis = { ...analysis, revision: revision.current };
            void (
              documentKey
                ? analysisCallbacks.current.onAnalysis?.(analysis, documentKey)
                : analysisCallbacks.current.onAnalysis?.(analysis)
            )?.catch(() => {});
          },
        )
      : null;
    const extensions = [
      // Keep editing primitives explicit: basicSetup also installs desktop panels,
      // completion popups, folding controls, and shortcuts that need native UI.
      configuration.of(editorConfiguration(preferencesRef.current)),
      highlightSpecialChars(),
      history(),
      codeFolding(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      codeEditorMatches,
      editorSearch,
      editability.of([
        EditorState.readOnly.of(readOnlyRef.current),
        EditorView.editable.of(!readOnlyRef.current),
      ]),
      intelligence?.extensions ?? [],
      inlineDiagnostics,
      editorAutocompletion(
        filename,
        hasAnalysis
          ? async (input) =>
              analysisCallbacks.current.onRequestAnalysis?.(
                input,
                documentKey,
              ) ?? null
          : undefined,
      ),
      // Preserve the file's newline convention when sending edits to native.
      initialValue.includes("\r\n") ? EditorState.lineSeparator.of("\r\n") : [],
      EditorView.updateListener.of((update) => {
        const searchSummary = getEditorSearchSummary(update.view);
        const searchSignature = JSON.stringify([documentKey, searchSummary]);
        if (lastSearchSummary.current !== searchSignature) {
          lastSearchSummary.current = searchSignature;
          void searchCallback
            .current?.(searchSummary, documentKey)
            .catch(() => {});
        }
        if (
          update.focusChanged ||
          update.selectionSet ||
          update.docChanged ||
          update.transactions.some((transaction) => transaction.effects.length)
        ) {
          reportInteraction(update.view, documentKey);
        }
        if (
          update.startState.field(codeEditorMatches) !==
          update.state.field(codeEditorMatches)
        )
          reportMatches(update.view);
        if (update.docChanged) {
          revision.current++;
          const pending = documentKey
            ? changeCallback.current?.(update.state.sliceDoc(), documentKey)
            : changeCallback.current?.(update.state.sliceDoc());
          if (pending) {
            pendingChanges.current.add(pending);
            void pending
              .catch((error: unknown) => {
                console.warn("Unable to report editor changes", error);
              })
              .finally(() => pendingChanges.current.delete(pending));
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
    const state = buffer
      ? buffer.state.update({
          effects: [
            StateEffect.reconfigure.of(extensions),
            // Saved states retain compartment overrides. Refresh global settings
            // when restoring a tab, even if the preference prop hasn't changed.
            configuration.reconfigure(
              editorConfiguration(preferencesRef.current),
            ),
            editability.reconfigure([
              EditorState.readOnly.of(readOnlyRef.current),
              EditorView.editable.of(!readOnlyRef.current),
            ]),
          ],
        }).state
      : EditorState.create({ doc: initialValue, extensions });
    // A tab owns its EditorState; the WebView and EditorView stay warm.
    const editor =
      view.current ?? new EditorView({ parent: host.current, state });
    if (view.current) editor.setState(state);
    editor.scrollDOM.scrollTop = buffer?.top ?? 0;
    editor.scrollDOM.scrollLeft = buffer?.left ?? 0;
    view.current = editor;
    // setState restores a tab without a selection transaction or focus event.
    reportInteraction(editor, documentKey);
    reportedMatches.current = null;
    if (!hasAnalysis)
      void analysisCallbacks.current
        .onAnalysis?.({ status: "unsupported", diagnostics: [] }, documentKey)
        .catch(() => {});
    const description = LanguageDescription.matchFilename(languages, filename);
    setLanguageError(false);
    void description
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
    const prepared = { editor, key: documentKey };
    setPreparedEditor(prepared);
    // Once fonts/layout are initialized, changing buffers is synchronous.
    // Highlighting can load afterward without hiding the file behind a spinner.
    if (fontsReady.current && notifiedEditor.current) {
      notifiedEditor.current = prepared;
      void readyCallback.current?.(documentKey).catch(() => {});
    }
    return () => {
      disposed = true;
      if (
        documentKey &&
        (!openKeys.current || openKeys.current.includes(documentKey))
      ) {
        buffers.current.set(documentKey, {
          state: editor.state,
          top: editor.scrollDOM.scrollTop,
          left: editor.scrollDOM.scrollLeft,
        });
      }
      intelligence?.destroy();
    };
  }, [filename, initialValue, hasAnalysis, editability, documentKey]);

  useEffect(
    () => () => {
      view.current?.destroy();
      view.current = null;
      notifiedEditor.current = null;
    },
    [],
  );

  useEffect(() => {
    if (view.current)
      updateEditorSearch(view.current, JSON.parse(searchQueryKey));
  }, [searchQueryKey, documentKey, filename, initialValue]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: setCodeEditorMatches.of(JSON.parse(matchesKey) as string[]),
    });
    reportMatches(editor);
    scrollToActiveCodeEditorMatch(editor);
  }, [matchesKey, filename, initialValue, hasAnalysis, documentKey]);

  useEffect(() => {
    view.current?.dispatch({
      effects: configuration.reconfigure(editorConfiguration(preferences)),
    });
  }, [preferences, configuration]);

  const indentation = `${preferences.tabSize}:${preferences.useTabs}`;
  const previousIndentation = useRef(indentation);
  useEffect(() => {
    const changed = previousIndentation.current !== indentation;
    previousIndentation.current = indentation;
    const editor = view.current;
    const key = documentKey;
    if (!changed || !editor || readOnly) return;
    // Coalesce stepper taps, and cancel before touching a different document.
    let cancelled = false;
    const timer = setTimeout(() => {
      void transformEditor(
        editor,
        filename,
        "format",
        preferencesRef.current,
        async (input) =>
          analysisCallbacks.current.onRequestAnalysis?.(input, key) ?? null,
        () =>
          !cancelled &&
          view.current === editor &&
          activeDocument.current === key,
      ).catch((error: unknown) => {
        if (!cancelled)
          void clipboard.current
            .onCommandError?.(
              error instanceof Error
                ? error.message
                : "Couldn’t format this file.",
            )
            .catch(() => {});
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [indentation, documentKey, filename, readOnly]);

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
    if (
      (!fontsLoaded && !fontError) ||
      !preparedEditor ||
      preparedEditor.editor !== view.current
    )
      return;
    let disposed = false;
    // Wait for CodeMirror's measured layout, not just the WebView load event.
    preparedEditor.editor.requestMeasure({
      read: () => undefined,
      write: () => {
        if (disposed || notifiedEditor.current === preparedEditor) return;
        notifiedEditor.current = preparedEditor;
        requestAnimationFrame(() => {
          if (!disposed && view.current === preparedEditor.editor)
            scrollToActiveCodeEditorMatch(preparedEditor.editor);
        });
        void readyCallback
          .current?.(preparedEditor.key)
          .catch((error: unknown) => {
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
      className={clsx(
        formatEditorThemeClassName(colorScheme),
        formatEditorThemeClass(preferences.theme),
      )}
      data-theme={colorScheme}
      aria-label="Code panel"
      style={
        {
          height: viewportHeight ?? "100%",
          colorScheme,
          "--editor-font-regular": `${formatEditorFontFamily(preferences.font)}_400Regular`,
          "--editor-font-semibold": `${formatEditorFontFamily(preferences.font)}_600SemiBold`,
          "--editor-font-italic": `${formatEditorFontFamily(preferences.font)}_400Regular${preferences.font === "Fira Code" ? "" : "_Italic"}`,
          "--editor-font-size": `${preferences.fontSize}px`,
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
