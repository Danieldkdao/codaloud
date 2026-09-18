import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useProjectFileSaveRegistry } from "./use-project-file-save";
import type { SaveSnapshot } from "../lib/project-file-save-document";

type SaveDocument = ReturnType<
  ReturnType<typeof useProjectFileSaveRegistry>["getDocument"]
>;
type EditorDocument = {
  key: string;
  path: string;
  version: number;
  initialValue: string;
  document: SaveDocument;
  release?: () => void;
  timer?: ReturnType<typeof setTimeout>;
};
type WorkspaceFiles = {
  activeFilePath: string | null;
  openFilePaths: ReadonlySet<string>;
  getFileVersion: (path: string) => number;
};
const loading: SaveSnapshot = { status: "loading" };
const emptySubscribe = () => () => {};
const getLoading = () => loading;
const cancelSave = (entry: EditorDocument) => {
  clearTimeout(entry.timer);
  entry.timer = undefined;
};

export const useProjectEditorDocuments = (
  files: WorkspaceFiles,
  content: string | undefined,
) => {
  const { getDocument } = useProjectFileSaveRegistry();
  const owner = useId();
  const sequence = useRef(0);
  const entries = useMemo(
    () => new Map<string, EditorDocument>(),
    [getDocument],
  );
  const path = files.activeFilePath;
  const version = path ? files.getFileVersion(path) : 0;
  const document = useMemo(() => {
    if (!path) return null;
    // An open editor owns its baseline until an explicit workspace refresh.
    // Background reads must not reset live text or its undo history.
    const existing = [...entries.values()].find(
      (item) => item.path === path && item.version === version,
    );
    return (
      existing?.document ??
      (content !== undefined ? getDocument(path, version, content) : null)
    );
  }, [entries, getDocument, path, version, content]);
  let entry = [...entries.values()].find(
    (item) =>
      item.document === document &&
      item.path === path &&
      item.version === version,
  );
  if (!entry && document && path) {
    entry = {
      key: `${owner}/${++sequence.current}`,
      path,
      version,
      initialValue: document.getContent(),
      document,
    };
    entries.set(entry.key, entry);
  }
  const active = useRef(entry);
  if (entry && active.current !== entry)
    entry.initialValue = entry.document.getContent();
  active.current = entry;
  const lastEditor = useRef<EditorDocument | undefined>(undefined);
  if (entry) lastEditor.current = entry;
  const status = useSyncExternalStore(
    document?.subscribe ?? emptySubscribe,
    document?.getSnapshot ?? getLoading,
  );

  useEffect(() => {
    // Keep clean documents registered while their tabs are open. The regular
    // save registry can still release documents used by other transient views.
    for (const [key, item] of entries) {
      if (
        !files.openFilePaths.has(item.path) ||
        files.getFileVersion(item.path) !== item.version ||
        (entry && item.path === entry.path && item !== entry)
      ) {
        cancelSave(item);
        item.release?.();
        entries.delete(key);
      } else item.release ??= item.document.subscribe(() => {});
    }
  });
  useEffect(
    () => () => {
      if (entry) {
        cancelSave(entry);
        void entry.document.flush().catch(() => {});
      }
    },
    [entry],
  );
  useEffect(
    () => () => {
      for (const item of entries.values()) {
        cancelSave(item);
        void item.document.flush().catch(() => {});
        item.release?.();
      }
    },
    [entries],
  );

  const onChange = useCallback(
    async (value: string, key?: string) => {
      const target = key ? entries.get(key) : active.current;
      if (!target) return;
      target.document.edit(value);
      cancelSave(target);
      if (target.document.getSnapshot().status === "saved") return;
      if (target !== active.current)
        void target.document.flush().catch(() => {});
      else
        target.timer = setTimeout(() => {
          void target.document.save();
        }, 3000);
    },
    [entries],
  );
  const flushFile = useCallback(
    async (filePath: string) => {
      for (const item of entries.values()) {
        if (item.path !== filePath) continue;
        cancelSave(item);
        await item.document.flush();
      }
    },
    [entries],
  );
  const retry = useCallback(() => {
    const item = active.current;
    if (!item) return;
    cancelSave(item);
    void item.document.save(true);
  }, []);

  return {
    editor: entry ?? lastEditor.current,
    activeKey: entry?.key,
    openDocumentKeys: [...entries.values()]
      .filter(
        (item) =>
          files.openFilePaths.has(item.path) &&
          files.getFileVersion(item.path) === item.version,
      )
      .map((item) => item.key),
    status,
    onChange,
    flushFile,
    retry,
    getPath: (key: string) => entries.get(key)?.path,
  };
};
