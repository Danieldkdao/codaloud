import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  readProjectFileContentAction,
  saveProjectFileContentAction,
} from "@/features/projects/actions/file-actions";

export type ProjectFileSaveStatus =
  "loading" | "pending" | "saving" | "saved" | "error";
export type SaveSnapshot = { status: ProjectFileSaveStatus; message?: string };

export const createFileSaveDocument = (
  projectId: string,
  path: string,
  initialValue: string,
  onSaved: (path: string, content: string, size: number) => void,
  onUsageChange: (path: string, inUse: boolean) => void,
) => {
  let content = initialValue;
  let confirmedContent = initialValue;
  let confirmedHash: string | undefined;
  let snapshot: SaveSnapshot = { status: "saved" };
  let inFlight: Promise<void> | null = null;
  let queued = false;
  let uncertainContent: string | undefined;
  let active = true;
  let paused = false;
  let releaseScheduled = false;
  const listeners = new Set<() => void>();
  const releaseIfUnused = () => {
    if (releaseScheduled) return;
    releaseScheduled = true;
    // React may disconnect and reconnect the same subscription in one commit
    // (including Strict Mode checks). Wait until that work has finished.
    void Promise.resolve().then(() => {
      releaseScheduled = false;
      if (active && listeners.size === 0 && !paused && !shouldRetain())
        onUsageChange(path, false);
    });
  };
  const publish = (next: SaveSnapshot) => {
    snapshot = next;
    listeners.forEach((notify) => notify());
  };
  const save = (retry = false, whilePaused = false): Promise<void> => {
    if (!active || (paused && !whilePaused) || (snapshot.status === "error" && !retry))
      return Promise.resolve();
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    if (content === confirmedContent && uncertainContent === undefined) {
      publish({ status: "saved" });
      return Promise.resolve();
    }
    queued = false;
    const submittedContent = content;
    const previousUncertainContent = uncertainContent;
    uncertainContent ??= submittedContent;
    publish({ status: "saving" });
    inFlight = Promise.resolve().then(async () => {
      try {
        if (previousUncertainContent !== undefined) {
          const currentFile = await readProjectFileContentAction(projectId, path);
          if (!active) return;
          if (!currentFile) throw new Error("Unable to reconcile the previous save");
          if (
            currentFile.content !== confirmedContent &&
            currentFile.content !== previousUncertainContent
          ) {
            publish({
              status: "error",
              message: "The file changed elsewhere. Reload it before trying again.",
            });
            return;
          }
          // Only our known text can become the next baseline. Reading it does not
          // confirm durability: the PUT below must succeed before publishing Saved.
          confirmedContent = currentFile.content;
          confirmedHash = undefined;
        }
        confirmedHash ??= bytesToHex(
          sha256(new TextEncoder().encode(confirmedContent)),
        );
        uncertainContent = submittedContent;
        const result = await saveProjectFileContentAction(projectId, {
          path,
          content: submittedContent,
          expectedContentHash: confirmedHash,
        });
        if (!active) return;
        if (result.error) {
          publish({ status: "error", message: result.message });
          return;
        }
        confirmedContent = submittedContent;
        confirmedHash = result.data.contentHash;
        uncertainContent = undefined;
        onSaved(path, submittedContent, result.data.size);
        publish({ status: content === confirmedContent ? "saved" : "pending" });
      } catch {
        if (active)
          publish({
            status: "error",
            message: "Unable to confirm the save. Please try again.",
          });
      } finally {
        inFlight = null;
        // Only a debounce that has already elapsed may start the next write.
        // A failed write retains its uncertain content and never retries itself.
        if (queued && snapshot.status !== "error") void save();
        queued = false;
        releaseIfUnused();
      }
    });
    return inFlight;
  };
  const shouldRetain = () =>
    Boolean(inFlight) || content !== confirmedContent || uncertainContent !== undefined;
  const flush = async (whilePaused = false) => {
    // Await the complete document, including edits queued behind the current PUT.
    // A background event must not write through a rename's pause.
    while (active && (!paused || whilePaused) && shouldRetain()) {
      await save(false, whilePaused);
      if (snapshot.status === "error") throw new Error(snapshot.message);
    }
    if (!active) throw new Error("The selected file has changed. Try again.");
  };
  return {
    getContent: () => content,
    getSnapshot: () => snapshot,
    shouldRetain,
    isPaused: () => paused,
    pause: () => { paused = true; },
    resume: () => { paused = false; releaseIfUnused(); },
    move: (nextPath: string) => { path = nextPath; },
    flush,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      if (active) onUsageChange(path, true);
      return () => {
        listeners.delete(notify);
        releaseIfUnused();
      };
    },
    edit: (value: string) => {
      if (!active || value === content) return;
      content = value;
      queued = false;
      publish({
        status:
          content === confirmedContent && uncertainContent === undefined
            ? "saved"
            : "pending",
      });
    },
    invalidate: () => {
      active = false;
      queued = false;
    },
    save,
  };
};
