import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  createDraftAction,
  updateDraftAction,
} from "@/features/drafts/actions/draft-actions";
import { draftFilenameSchema } from "@/features/drafts/lib/draft-filename";
import { draftSaveDebounceMs } from "@/features/drafts/constants";
import type {
  DraftMutationResult,
  DraftResponseData,
} from "@/features/drafts/types";

export type DraftSaveInput = { filename: string | null; content: string };
export type DraftSaveState = "unsaved" | "saving" | "saved" | "error";

/** A draft only earns a row once it has content or a filename. */
export const isSavableDraft = (input: DraftSaveInput) =>
  input.content.length > 0 || Boolean(input.filename);

const normalizeDraftSaveInput = (input: DraftSaveInput): DraftSaveInput => ({
  filename: input.filename?.trim() || null,
  content: input.content,
});

const draftSaveValidationError = (input: DraftSaveInput) => {
  if (!input.filename) return null;
  const result = draftFilenameSchema.safeParse(input.filename);
  return result.success ? null : result.error.issues[0]?.message ?? "Invalid filename.";
};

const sameDraftSaveInput = (
  first: DraftSaveInput | null,
  second: DraftSaveInput,
) =>
  first !== null &&
  first.filename === second.filename &&
  first.content === second.content;

/**
 * Draft writes are serialized and always take the newest queued buffer, so an
 * older edit can never overwrite work typed while a write was in flight.
 */
export const useDraftSave = (savedDraftId: string | null) => {
  const queryClient = useQueryClient();
  const [draftId, setDraftId] = useState(savedDraftId);
  const [state, setState] = useState<DraftSaveState>(
    savedDraftId ? "saved" : "unsaved",
  );
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const queue = useRef<DraftSaveInput | null>(null);
  const written = useRef<DraftSaveInput | null>(null);
  const identifier = useRef<string | null>(savedDraftId);
  const busy = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<DraftSaveInput | null>(null);

  const report = useCallback(
    (next: { state?: DraftSaveState; message?: string | null }) => {
      if (!mounted.current) return;
      if (next.state !== undefined) setState(next.state);
      if (next.message !== undefined) setMessage(next.message);
    },
    [],
  );

  const publish = useCallback(
    (draft: DraftResponseData) => {
      queryClient.setQueryData(["drafts", "detail", draft.id], draft);
      void queryClient.invalidateQueries({ queryKey: ["drafts", "infinite"] });
    },
    [queryClient],
  );

  const drain = useCallback((): Promise<void> => {
    busy.current ??= (async () => {
      try {
        while (queue.current) {
          const input = queue.current;
          queue.current = null;
          report({ state: "saving" });
          const savedDraft: DraftMutationResult = identifier.current
            ? await updateDraftAction(identifier.current, input)
            : await createDraftAction(input);
          if (savedDraft.error) {
            // A newer buffer already supersedes this failed write.
            if (queue.current) continue;
            queue.current = input;
            report({ state: "error", message: savedDraft.message });
            return;
          }
          written.current = input;
          if (!identifier.current) {
            identifier.current = savedDraft.data.id;
            if (mounted.current) setDraftId(savedDraft.data.id);
          }
          publish(savedDraft.data);
          // A newer edit may have landed while this write was running.
          report(
            queue.current
              ? { state: "saving" }
              : { state: "saved", message: null },
          );
        }
      } finally {
        busy.current = null;
      }
    })();
    return busy.current;
  }, [publish, report]);

  // Leaving the screen mid-debounce must not drop the newest edits.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (
        latest.current &&
        !draftSaveValidationError(latest.current) &&
        !sameDraftSaveInput(written.current, latest.current)
      )
        queue.current = latest.current;
      void drain();
    };
  }, [drain]);

  const save = useCallback(
    (input: DraftSaveInput) => {
      const next = normalizeDraftSaveInput(input);
      latest.current = next;
      const validationError = draftSaveValidationError(next);
      if (validationError) {
        queue.current = null;
        report({ state: "error", message: validationError });
        return false;
      }
      if (!isSavableDraft(next)) {
        report({ message: "Add content or a filename to save this draft." });
        return false;
      }
      if (sameDraftSaveInput(written.current, next)) return true;
      queue.current = next;
      void drain();
      return false;
    },
    [drain, report],
  );

  /** Debounced autosave entry point; a newer buffer replaces one already queued. */
  const schedule = useCallback(
    (input: DraftSaveInput, delayMs = draftSaveDebounceMs) => {
      // Record the buffer now: leaving before the timer fires still saves it.
      latest.current = normalizeDraftSaveInput(input);
      if (timer.current) clearTimeout(timer.current);
      const validationError = draftSaveValidationError(latest.current);
      if (validationError) {
        timer.current = null;
        queue.current = null;
        report({ state: "error", message: validationError });
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        save(input);
      }, delayMs);
    },
    [save],
  );

  /** Writes immediately, then resolves with the saved row id, or null when nothing was durable. */
  const saveNow = useCallback(
    async (input: DraftSaveInput) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const next = normalizeDraftSaveInput(input);
      latest.current = next;
      const validationError = draftSaveValidationError(next);
      if (validationError) {
        queue.current = null;
        report({ state: "error", message: validationError });
        return null;
      }
      if (!isSavableDraft(next)) return null;
      queue.current = next;
      await drain();
      return sameDraftSaveInput(written.current, next)
        ? identifier.current
        : null;
    },
    [drain],
  );

  const retry = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void drain();
  }, [drain]);

  const hasUnsavedChanges = useCallback(
    () => queue.current !== null || busy.current !== null,
    [],
  );

  return {
    draftId,
    state,
    message,
    schedule,
    save,
    saveNow,
    retry,
    hasUnsavedChanges,
  };
};
