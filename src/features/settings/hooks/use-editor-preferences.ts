import { useEffect, useSyncExternalStore } from "react";
import Storage from "expo-sqlite/kv-store";
import { createEditorPreferences } from "../editor-preferences";

const state = createEditorPreferences(Storage);
export const useEditorPreferences = () => {
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  useEffect(() => { void state.load(); }, []);
  return { ...snapshot, update: state.update };
};
