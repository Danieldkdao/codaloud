import { defaultEditorPreferences, editorFonts, editorThemes } from "./constants";
import type { EditorPreferences } from "./types";

const restorePreferences = (raw: string | null): EditorPreferences => {
  let saved: Partial<EditorPreferences> = {};
  try { saved = JSON.parse(raw ?? "{}") ?? {}; } catch { /* Recover malformed device data. */ }
  const preferences = { ...defaultEditorPreferences };
  if (editorThemes.includes(saved.theme!)) preferences.theme = saved.theme!;
  if (editorFonts.includes(saved.font!)) preferences.font = saved.font!;
  if (Number.isInteger(saved.fontSize) && saved.fontSize! >= 10 && saved.fontSize! <= 32) preferences.fontSize = saved.fontSize!;
  if (Number.isInteger(saved.tabSize) && saved.tabSize! >= 1 && saved.tabSize! <= 8) preferences.tabSize = saved.tabSize!;
  for (const key of ["wordWrap", "lineNumbers", "minimap", "useTabs", "keepIndentation", "closeBrackets"] as const)
    if (typeof saved[key] === "boolean") preferences[key] = saved[key];
  return preferences;
};

export const createEditorPreferences = (storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
}) => {
  const key = "codaloud.editor-preferences.v1";
  let snapshot = { preferences: { ...defaultEditorPreferences }, ready: false, error: null as string | null };
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = () => { snapshot = { ...snapshot }; listeners.forEach((listener) => listener()); };
  const load = () => loading ??= (async () => {
    try { snapshot.preferences = restorePreferences(await storage.getItem(key)); }
    catch { snapshot.error = "Couldn’t restore editor settings. Your next change will save them again."; }
    snapshot.ready = true;
    publish();
  })();
  const update = async (patch: Partial<EditorPreferences>) => {
    if (!snapshot.ready) await load();
    snapshot.preferences = restorePreferences(JSON.stringify({ ...snapshot.preferences, ...patch }));
    const value = JSON.stringify(snapshot.preferences);
    snapshot.error = null;
    publish();
    writes = writes.then(async () => {
      try { await storage.setItem(key, value); snapshot.error = null; }
      catch { snapshot.error = "Settings changed but couldn’t be saved. Tap Retry to save them on this device."; }
      publish();
    });
    await writes;
  };
  return {
    load, update, getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
};
