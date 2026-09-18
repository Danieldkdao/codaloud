import { useDebouncer } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { isProjectFilePathWithin } from "@/features/projects/lib/files";
import {
  createFileSaveDocument,
  type SaveSnapshot,
} from "@/features/projects/lib/project-file-save-document";
import { useAuthSession } from "@/hooks/use-auth-session";
export type { ProjectFileSaveStatus } from "@/features/projects/lib/project-file-save-document";

type SaveDocument = ReturnType<typeof createFileSaveDocument>;
type FileSaveRegistryState = {
  getDocument: (path: string, version: number, content: string) => SaveDocument;
  flushPendingSaves: () => Promise<void>;
  invalidateFiles: (root: string) => void;
  withSavedFiles: <T>(action: () => Promise<T>) => Promise<T>;
  renameFiles: <T>(
    previousPath: string,
    nextPath: string,
    rename: () => Promise<T>,
  ) => Promise<T>;
};
const RegistryContext = createContext<FileSaveRegistryState | null>(null);
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
  const [gitOperation] = useState(() => ({
    current: null as Set<SaveDocument> | null,
  }));
  const [protectedDrafts] = useState(() => new Set<SaveDocument>());
  const [renameOperation] = useState(() => ({
    current: null as { previousPath: string; paused: Set<SaveDocument> } | null,
  }));
  const registerDocument = useCallback(
    (path: string, version: number, document: SaveDocument) => {
      if (
        renameOperation.current &&
        isProjectFilePathWithin(path, renameOperation.current.previousPath)
      ) {
        document.pause();
        renameOperation.current.paused.add(document);
      }
      if (gitOperation.current) {
        document.pause();
        gitOperation.current.add(document);
      }
      documents.set(path, { version, document });
    },
    [documents, renameOperation, gitOperation],
  );
  const getDocument = useCallback(
    (path: string, version: number, content: string) => {
      const existing = documents.get(path);
      // A bridge event can arrive after the editor becomes read-only. Retain
      // that draft across Git's document refresh; expected hashes protect retry.
      if (
        existing &&
        (gitOperation.current || protectedDrafts.has(existing.document)) &&
        existing.document.shouldRetain()
      )
        return existing.document;
      if (
        existing?.version === version &&
        (existing.document.isPaused() ||
          existing.document.shouldRetain() ||
          existing.document.getContent() === content)
      )
        return existing.document;
      if (existing) protectedDrafts.delete(existing.document);
      existing?.document.invalidate();
      const document = createFileSaveDocument(
        projectId,
        path,
        content,
        (savedPath, savedContent, size) => {
          // Cache only confirmed bytes; newer local edits remain in this document.
          queryClient.setQueryData(
            ["projects", "file", userId, projectId, savedPath],
            { path: savedPath, content: savedContent, size },
          );
          void queryClient.invalidateQueries({
            queryKey: ["projects", "files", userId, projectId],
          });
          // Refresh an active changes panel, or mark its snapshot stale so it
          // reloads when reopened. Only confirmed writes reach this callback.
          void queryClient.invalidateQueries({
            queryKey: ["projects", "changes", userId, projectId],
            exact: true,
          });
        },
        (documentPath, inUse) => {
          // A retained React tree can reconnect after its clean entry was released.
          if (inUse) {
            if (!documents.has(documentPath))
              registerDocument(documentPath, version, document);
            return;
          }
          // Renames move the key; a recreated path may already own a replacement.
          if (documents.get(documentPath)?.document !== document) return;
          documents.delete(documentPath);
          protectedDrafts.delete(document);
        },
      );
      registerDocument(path, version, document);
      return document;
    },
    [
      documents,
      projectId,
      queryClient,
      registerDocument,
      userId,
      gitOperation,
      protectedDrafts,
    ],
  );
  const flushPendingSaves = useCallback(async () => {
    while (true) {
      if (gitOperation.current)
        throw new Error("A Git operation is in progress. Please wait.");
      // A paused document's normal flush returns without saving. Never treat
      // that as confirmation or write through a rename's pause.
      if (renameOperation.current)
        throw new Error(
          "A file rename is in progress. Wait for it to finish, then try again.",
        );
      const pending = [...documents.values()].filter(({ document }) =>
        document.shouldRetain(),
      );
      if (pending.length === 0) return;
      const results = await Promise.allSettled(
        pending.map(({ document }) => document.flush()),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) {
        const message =
          failure.reason instanceof Error
            ? failure.reason.message
            : "Unable to save your changes.";
        throw new Error(`${message} Open Code to retry saving your changes.`);
      }
      // Navigation and late editor events can add drafts while earlier saves
      // drain. Recheck the registry before allowing a dependent read to start.
    }
  }, [documents, renameOperation, gitOperation]);
  const withSavedFiles = useCallback<FileSaveRegistryState["withSavedFiles"]>(
    async (action) => {
      if (gitOperation.current || renameOperation.current)
        throw new Error("A file or Git operation is already in progress.");
      const paused = new Set<SaveDocument>();
      gitOperation.current = paused;
      try {
        do {
          const entries = [...documents.values()];
          for (const { document } of entries) {
            document.pause();
            paused.add(document);
          }
          const results = await Promise.allSettled(
            entries.map(({ document }) => document.flush(true)),
          );
          const failed = results.find((result) => result.status === "rejected");
          if (failed) throw failed.reason;
        } while (
          [...documents.values()].some(({ document }) =>
            document.shouldRetain(),
          )
        );
        return await action();
      } finally {
        gitOperation.current = null;
        for (const document of paused) {
          if (document.shouldRetain()) protectedDrafts.add(document);
          document.resume();
        }
      }
    },
    [documents, gitOperation, protectedDrafts, renameOperation],
  );
  const renameFiles = useCallback<FileSaveRegistryState["renameFiles"]>(
    async (previousPath, nextPath, rename) => {
      if (gitOperation.current)
        throw new Error("A Git operation is in progress. Please wait.");
      if (renameOperation.current)
        throw new Error("Another rename is in progress. Please try again.");
      const operation = { previousPath, paused: new Set<SaveDocument>() };
      renameOperation.current = operation;
      const affected = () =>
        [...documents].filter(([path]) =>
          isProjectFilePathWithin(path, previousPath),
        );
      try {
        for (const [path, entry] of documents) {
          if (
            !isProjectFilePathWithin(path, previousPath) &&
            isProjectFilePathWithin(path, nextPath) &&
            entry.document.shouldRetain()
          )
            throw new Error(
              "The destination has unsaved edits. Save them before renaming.",
            );
        }
        // Recheck after each await: navigation can open another descendant while
        // saves drain. New documents join the pause in getDocument above.
        do {
          const entries = affected();
          for (const [, { document }] of entries) {
            document.pause();
            operation.paused.add(document);
          }
          const results = await Promise.allSettled(
            entries.map(([, { document }]) => document.flush(true)),
          );
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          if (failure) throw failure.reason;
        } while (
          affected().some(([, { document }]) => document.shouldRetain())
        );

        const result = await rename();
        for (const [path, entry] of affected()) {
          const destination = nextPath + path.slice(previousPath.length);
          if (destination === path) continue;
          documents.get(destination)?.document.invalidate();
          documents.delete(path);
          entry.document.move(destination);
          documents.set(destination, entry);
        }
        return result;
      } finally {
        renameOperation.current = null;
        // Late editor events remain drafts while writes are paused. Resume them
        // at the confirmed new path, or the original path if rename failed.
        for (const document of operation.paused) {
          document.resume();
          void document.flush().catch(() => {});
        }
      }
    },
    [documents, renameOperation, gitOperation],
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "inactive" && state !== "background") return;
      for (const { document } of documents.values()) {
        // The document publishes failures; repeated lifecycle events do not retry them.
        void document.flush().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [documents]);
  return (
    <RegistryContext
      value={{ getDocument, flushPendingSaves, withSavedFiles, renameFiles,
        invalidateFiles: (root) => {
          for (const [path, entry] of documents) {
            if (!isProjectFilePathWithin(path, root)) continue;
            entry.document.invalidate();
            protectedDrafts.delete(entry.document);
            documents.delete(path);
          }
        },
      }}
    >
      {children}
    </RegistryContext>
  );
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
  const registry = useContext(RegistryContext);
  if (!registry)
    throw new Error(
      "ProjectFileSaveProvider requires ProjectFileSaveRegistryProvider",
    );
  const [document] = useState(() =>
    registry.getDocument(filePath, version, initialValue),
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

export const useProjectFileSaveRegistry = () => {
  const registry = useContext(RegistryContext);
  if (!registry)
    throw new Error("File operations require ProjectFileSaveRegistryProvider");
  return registry;
};
