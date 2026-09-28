import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { CodeEditorRef } from "@/components/code-editor";
import { createEditorFlush } from "../flush";
import { streamEditorExplanation } from "../explanation-actions";
import { explanationSpeech } from "../explanation-speech-client";
import type { EditorExplanationState, EditorSnapshot } from "../types";

type ExplanationOptions = {
  editor: RefObject<Pick<CodeEditorRef, "captureContext"> | null>;
  documentKey?: string;
  path: string | null;
  revision?: number;
  enabled: boolean;
};
export const useEditorExplanation = (options: ExplanationOptions) => {
  const current = useRef(options);
  current.current = options;
  const active = useRef<AbortController | null>(null);
  const snapshot = useRef<EditorSnapshot | null>(null);
  const pendingId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<EditorExplanationState | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [capture] = useState(() =>
    createEditorFlush((id) => {
      pendingId.current = `explain:${id}`;
      if (!current.current.editor.current) throw new Error("Editor not ready.");
      current.current.editor.current.captureContext(pendingId.current);
    }),
  );
  const close = useCallback(() => {
    active.current?.abort();
    active.current = null;
    pendingId.current = undefined;
    snapshot.current = null;
    capture.dispose();
    // Stop narrating before the bubble leaves, so speech never outlives it.
    explanationSpeech().stop();
    setSpeaking(false);
    setState(null);
  }, [capture]);
  useEffect(() => close(), [options.documentKey, options.enabled, close]);
  useEffect(() => {
    const source = snapshot.current;
    if (
      !options.enabled ||
      (source &&
        (source.documentKey !== options.documentKey ||
          (options.revision !== undefined &&
            source.revision !== options.revision)))
    )
      close();
  }, [options.documentKey, options.revision, options.enabled, close]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      capture.dispose();
    },
    [capture],
  );
  const start = async () => {
    close();
    const before = current.current;
    if (!before.enabled || !before.documentKey || !before.path) return;
    const controller = new AbortController();
    active.current = controller;
    const spokenText = { current: "" };
    const isCurrent = () =>
      active.current === controller &&
      !controller.signal.aborted &&
      current.current.documentKey === before.documentKey &&
      current.current.enabled;
    const timeout = setTimeout(() => controller.abort(), 35000);
    setState({ status: "loading", text: "", highlight: null });
    try {
      await capture.flush();
      if (!isCurrent()) return;
      const source = snapshot.current;
      if (
        !source ||
        source.documentKey !== before.documentKey ||
        source.to <= source.from ||
        !source.content.slice(source.from, source.to).trim()
      )
        throw new Error("Select some code to explain.");
      if (source.to - source.from > 24000)
        throw new Error("Select a smaller section of code to explain.");
      const { documentKey, revision, from, to } = source;
      const highlight = { documentKey, revision, from, to };
      setState({ status: "loading", text: "", highlight });
      await streamEditorExplanation(
        {
          path: before.path,
          selected: source.content.slice(from, to),
          before: source.content.slice(Math.max(0, from - 1000), from),
          after: source.content.slice(to, to + 1000),
        },
        controller.signal,
        (text) => {
          spokenText.current = text;
          if (isCurrent()) setState({ status: "streaming", text, highlight });
        },
      );
      setState((value) => value && { ...value, status: "ready" });
    } catch (error) {
      if (active.current === controller)
        setState(
          (value) =>
            value && {
              ...value,
              status: "error",
              error: controller.signal.aborted
                ? "The explanation timed out. Please try again."
                : error instanceof Error
                  ? error.message
                  : "Couldn’t explain this code. Please try again.",
            },
        );
    } finally {
      clearTimeout(timeout);
    }
  };
  // Reading aloud is opt-in. Speaking on its own fought the voice conversation for
  // the audio session and produced failures only visible in a log.
  const readAloud = useCallback(async (text: string) => {
    const speech = explanationSpeech();
    speech.stop();
    setSpeechError(null);
    setSpeaking(true);
    try {
      await speech.speak(text);
    } finally {
      setSpeaking(false);
    }
  }, []);
  const toggleReadAloud = useCallback(() => {
    if (speaking) {
      explanationSpeech().stop();
      setSpeaking(false);
      return;
    }
    const text = state?.text ?? "";
    if (!text.trim()) return;
    void readAloud(text);
  }, [readAloud, speaking, state?.text]);
  return {
    state,
    speaking,
    speechError,
    readAloud,
    toggleReadAloud,
    highlight: state?.highlight ?? null,
    start,
    close,
    onContext: async (id: string, value: EditorSnapshot | null) => {
      if (id !== pendingId.current) return;
      snapshot.current = value;
      capture.acknowledge(
        id.slice("explain:".length),
        value ? null : "Editor not ready.",
      );
    },
  };
};
