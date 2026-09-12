import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { useDebouncer } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { saveProjectFileContentAction } from "@/features/projects/actions/file-actions";
import { useAuthSession } from "@/hooks/use-auth-session";

export type ProjectFileSaveStatus =
  "loading" | "pending" | "saving" | "saved" | "error";
type SaveSnapshot = { status: ProjectFileSaveStatus; message?: string };

const createFileSaveDocument = (
  projectId: string,
  path: string,
  initialValue: string,
  onSaved: (content: string, size: number) => void,
) => {
  let content = initialValue;
  let confirmedContent = initialValue;
  let confirmedHash: string | undefined;
  let snapshot: SaveSnapshot = { status: "saved" };
  let inFlight: Promise<void> | null = null;
  let queued = false;
  let uncertain = false;
  let active = true;
  const listeners = new Set<() => void>();
  const publish = (next: SaveSnapshot) => {
    snapshot = next;
    listeners.forEach((notify) => notify());
  };
  const save = (retry = false): Promise<void> => {
    if (!active || (snapshot.status === "error" && !retry))
      return Promise.resolve();
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    if (content === confirmedContent && !uncertain) {
      publish({ status: "saved" });
      return Promise.resolve();
    }
    queued = false;
    const submittedContent = content;
    uncertain = true;
    publish({ status: "saving" });
    inFlight = Promise.resolve().then(async () => {
      try {
        confirmedHash ??= bytesToHex(
          sha256(new TextEncoder().encode(confirmedContent)),
        );
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
        uncertain = false;
        onSaved(submittedContent, result.data.size);
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
        // A failed write keeps its original base hash and never retries itself.
        if (queued && snapshot.status !== "error") void save();
        queued = false;
      }
    });
    return inFlight;
  };
  return {
    getContent: () => content,
    getSnapshot: () => snapshot,
    shouldRetain: () =>
      Boolean(inFlight) || content !== confirmedContent || uncertain,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    edit: (value: string) => {
      if (!active || value === content) return;
      content = value;
      queued = false;
      publish({
        status:
          content === confirmedContent && !uncertain ? "saved" : "pending",
      });
    },
    invalidate: () => {
      active = false;
      queued = false;
    },
    save,
  };
};

type SaveDocument = ReturnType<typeof createFileSaveDocument>;
const RegistryContext = createContext<
  ((path: string, version: number, content: string) => SaveDocument) | null
>(null);
type ProjectFileSaveState = SaveSnapshot & {
  initialValue: string;
  onChange: (value: string) => Promise<void>;
  retry: () => void;
};
const FileSaveContext = createContext<ProjectFileSaveState | null>(null);

const FileSaveRegistry = ({
  projectId,
  userId,
  children,
}: {
  projectId: string;
  userId: string | null;
  children: ReactNode;
}) => {
  const queryClient = useQueryClient();
  const [documents] = useState(
    () => new Map<string, { version: number; document: SaveDocument }>(),
  );
  const getDocument = useCallback(
    (path: string, version: number, content: string) => {
      const existing = documents.get(path);
      if (
        existing?.version === version &&
        (existing.document.shouldRetain() ||
          existing.document.getContent() === content)
      )
        return existing.document;
      existing?.document.invalidate();
      const document = createFileSaveDocument(
        projectId,
        path,
        content,
        (savedContent, size) => {
          // Cache only confirmed bytes; newer local edits remain in this document.
          queryClient.setQueryData(
            ["projects", "file", userId, projectId, path],
            { path, content: savedContent, size },
          );
          void queryClient.invalidateQueries({
            queryKey: ["projects", "files", userId, projectId],
          });
        },
      );
      documents.set(path, { version, document });
      return document;
    },
    [documents, projectId, queryClient, userId],
  );
  return <RegistryContext value={getDocument}>{children}</RegistryContext>;
};

export const ProjectFileSaveRegistryProvider = ({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) => {
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  return (
    <FileSaveRegistry
      key={`${userId}/${projectId}`}
      projectId={projectId}
      userId={userId}
    >
      {children}
    </FileSaveRegistry>
  );
};

export const ProjectFileSaveProvider = ({
  filePath,
  version,
  initialValue,
  children,
}: {
  filePath: string;
  version: number;
  initialValue: string;
  children: ReactNode;
}) => {
  const getDocument = useContext(RegistryContext);
  if (!getDocument)
    throw new Error(
      "ProjectFileSaveProvider requires ProjectFileSaveRegistryProvider",
    );
  const [document] = useState(() =>
    getDocument(filePath, version, initialValue),
  );
  const [editorInitialValue] = useState(document.getContent);
  const snapshot = useSyncExternalStore(
    document.subscribe,
    document.getSnapshot,
  );
  const { maybeExecute, cancel } = useDebouncer(
    () => {
      void document.save();
    },
    {
      wait: 3000,
      // Navigation starts a pending save for this exact document, without waiting
      // for its timer or redirecting the request to the newly selected file.
      onUnmount: (debouncer) => debouncer.flush(),
    },
  );
  const onChange = useCallback(
    async (value: string) => {
      document.edit(value);
      if (document.getSnapshot().status === "saved") cancel();
      else maybeExecute();
    },
    [document, maybeExecute, cancel],
  );
  const retry = useCallback(() => {
    cancel();
    void document.save(true);
  }, [cancel, document]);
  return (
    <FileSaveContext
      value={{ ...snapshot, initialValue: editorInitialValue, onChange, retry }}
    >
      {children}
    </FileSaveContext>
  );
};

export const useProjectFileSave = () => useContext(FileSaveContext);
