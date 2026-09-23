import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  CodeEditorRef,
  CodeEditorInteraction,
} from "@/components/code-editor";
import { createEditorFlush } from "@/features/editor/flush";
import type {
  EditorSnapshot,
  InlineSuggestion,
  InlineSuggestionAction,
} from "@/features/editor/types";
import { inlineSession } from "../inline-session";
import { inlineAcceptanceOperation } from "../constants";

export const useVoiceEditor = (options: {
  projectId: string;
  branch: string | null;
  busy: boolean;
  activePath: string | null;
  documentKey?: string;
  editor: RefObject<CodeEditorRef | null>;
  getOpenFiles: () => { path: string; content: string }[];
  runWorkspaceOperation: <T>(
    label: string,
    action: (assertCurrent: () => void) => Promise<T>,
  ) => Promise<T>;
}) => {
  const current = useRef(options);
  current.current = options;
  const snapshot = useRef<EditorSnapshot | null>(null);
  const pendingApply = useRef<{
    value: InlineSuggestion;
    key: string;
    revision: number;
    acknowledgement?: string;
  } | null>(null);
  const [capture] = useState(() =>
    createEditorFlush((id) => {
      if (!current.current.editor.current) throw new Error("Editor not ready.");
      current.current.editor.current.captureContext(id);
    }),
  );
  const [apply] = useState(() =>
    createEditorFlush((id) => {
      const pending = pendingApply.current;
      if (!pending || !current.current.editor.current)
        throw new Error("Editor not ready.");
      pending.acknowledgement = id;
      current.current.editor.current.acceptSuggestion(
        pending.value.id,
        pending.key,
        pending.revision,
      );
    }),
  );
  useEffect(
    () => () => {
      capture.dispose();
      apply.dispose();
    },
    [capture, apply],
  );
  useEffect(
    () =>
      inlineSession.register(options.projectId, {
        capture: async () => {
          const before = current.current;
          if (before.busy)
            throw new Error("Wait for the workspace operation to finish.");
          if (before.activePath && before.documentKey) await capture.flush();
          // The history picker can display a branch that is not checked out.
          const { readProjectGitCountsAction } =
            await import("@/features/projects/actions/git-actions");
          const checkout = await readProjectGitCountsAction(before.projectId);
          if (!checkout)
            throw new Error("Could not confirm the current branch.");
          const after = current.current;
          if (
            after.busy ||
            before.projectId !== after.projectId ||
            before.branch !== after.branch ||
            before.documentKey !== after.documentKey
          )
            throw new Error("The workspace changed. Please try again.");
          const activeFile =
            after.activePath &&
            after.documentKey &&
            snapshot.current?.documentKey === after.documentKey
              ? { ...snapshot.current, path: after.activePath }
              : null;
          return {
            projectId: after.projectId,
            branch: checkout.currentBranch ?? checkout.headSha ?? "",
            activeFile,
            openFiles: after
              .getOpenFiles()
              .map((file) =>
                file.path === activeFile?.path
                  ? { path: file.path, content: activeFile.content }
                  : file,
              ),
          };
        },
        preview: (value, context) => {
          const file = context.activeFile;
          if (file)
            current.current.editor.current?.previewSuggestion(
              value,
              file.documentKey,
              file.revision,
            );
        },
        apply: async (value, context) => {
          const file = context.activeFile;
          if (!file || current.current.busy) return false;
          return current.current.runWorkspaceOperation(
            inlineAcceptanceOperation,
            async (assertCurrent) => {
              const { readProjectGitCountsAction } =
                await import("@/features/projects/actions/git-actions");
              const checkout = await readProjectGitCountsAction(
                context.projectId,
              );
              assertCurrent();
              if (
                !checkout ||
                (checkout.currentBranch ?? checkout.headSha ?? "") !==
                  context.branch ||
                inlineSession.getSnapshot()?.id !== value.id
              )
                return false;
              pendingApply.current = {
                value,
                key: file.documentKey,
                revision: file.revision,
              };
              try {
                await apply.flush();
                return true;
              } finally {
                pendingApply.current = null;
              }
            },
          );
        },
      }),
    [options.projectId, capture, apply],
  );
  useEffect(() => {
    const request = inlineSession.getSnapshot();
    if (request?.projectId === options.projectId && options.busy)
      inlineSession.cancel();
  }, [options.projectId, options.busy]);
  useEffect(
    () => () => {
      if (inlineSession.getSnapshot()?.projectId === options.projectId)
        inlineSession.cancel();
    },
    [options.projectId, options.branch],
  );
  return {
    onContext: async (id: string, value: EditorSnapshot | null) => {
      snapshot.current = value;
      capture.acknowledge(id, value ? null : "Editor not ready.");
    },
    onInteraction: (state: CodeEditorInteraction, key?: string) =>
      inlineSession.invalidate(key, state.revision),
    onSuggestionAction: async (id: string, action: InlineSuggestionAction) => {
      if (inlineSession.getSnapshot()?.id !== id) return;
      if (action === "accept") await inlineSession.accept(id);
      else inlineSession.cancel();
    },
    onSuggestionApplied: async (id: string, applied: boolean) => {
      const pending = pendingApply.current;
      if (pending?.value.id === id && pending.acknowledgement)
        apply.acknowledge(
          pending.acknowledgement,
          applied ? null : "The suggestion is no longer current.",
        );
    },
  };
};
