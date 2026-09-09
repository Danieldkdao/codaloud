"use dom";

import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import {
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import "@/global.css";
import "@/styles/code-editor.css";

type CodeEditorProps = {
  filename: string;
  /** Initial text for this document. Live edits stay inside CodeMirror. */
  initialValue: string;
  bottomInset?: number;
  /** Signals that CodeMirror has finished its initial layout. */
  onReady?: () => Promise<void>;
  dom?: import("expo/dom").DOMProps;
};

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier],
    color: "var(--primary)",
    fontWeight: "600",
  },
  { tag: [tags.string, tags.regexp], color: "var(--primary)" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.typeName, tags.className],
    color: "var(--accent)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--foreground)",
    fontWeight: "600",
  },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
]);

const CodeEditor = ({
  filename,
  initialValue,
  bottomInset = 0,
  onReady,
}: CodeEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const inset = useRef(bottomInset);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
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

  useEffect(() => {
    if (!host.current) return;
    const language = new Compartment();
    let disposed = false;
    const editor = new EditorView({
      parent: host.current,
      doc: initialValue,
      extensions: [
        basicSetup,
        search({ top: true }),
        EditorState.tabSize.of(2),
        syntaxHighlighting(highlightStyle),
        language.of([]),
        EditorView.contentAttributes.of({
          "aria-label": `${filename} code editor`,
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: "false",
        }),
        EditorView.scrollMargins.of(() => ({ bottom: inset.current })),
      ],
    });
    view.current = editor;
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
      editor.destroy();
      view.current = null;
    };
  }, [filename, initialValue]);

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
        void readyCallback.current?.().catch((error: unknown) => {
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
      className="code-editor-shell"
      aria-label="Code panel"
      style={
        {
          height: viewportHeight ?? "100%",
          "--editor-bottom-inset": `${effectiveInset}px`,
        } as CSSProperties
      }
    >
      {languageError ? (
        <div role="status" className="code-editor-notice">
          Highlighting unavailable. You can still edit this file.
        </div>
      ) : null}
      <div ref={host} className="code-editor-host" />
    </section>
  );
};

export default CodeEditor;
