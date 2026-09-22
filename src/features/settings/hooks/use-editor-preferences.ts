import { useEffect, useSyncExternalStore } from "react";
import Storage from "expo-sqlite/kv-store";
import { createEditorPreferences } from "../editor-preferences";

export const editorPreferencesStore = createEditorPreferences(Storage);
export const useEditorPreferences = () => {
  const snapshot = useSyncExternalStore(
    editorPreferencesStore.subscribe,
    editorPreferencesStore.getSnapshot,
  );
  useEffect(() => {
    void editorPreferencesStore.load();
  }, []);
  return { ...snapshot, update: editorPreferencesStore.update };
};
