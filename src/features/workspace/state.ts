import type { WorkspaceSnapshot, WorkspaceStorage } from "./types";

export const createWorkspaceState = (storage: WorkspaceStorage) => {
  let snapshot: WorkspaceSnapshot = { ready: false, workspace: null, error: null, isEntering: false };
  let loading: Promise<void> | undefined;
  let entering: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<WorkspaceSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load: () => {
      if (snapshot.workspace) return Promise.resolve();
      loading ??= (async () => {
        try {
          const workspace = await storage.load();
          publish({ ready: true, workspace, error: null });
        } catch {
          publish({ ready: true, error: "Unable to open your workspace on this device. Please try again." });
        } finally {
          loading = undefined;
        }
      })();
      return loading;
    },
    enter: () => {
      if (!snapshot.workspace || snapshot.workspace.hasEntered) return Promise.resolve();
      entering ??= (async () => {
        publish({ isEntering: true, error: null });
        try {
          const workspace = await storage.enter();
          publish({ workspace, error: null });
        } catch {
          publish({ error: "Unable to save your preference on this device. Please try again." });
        } finally {
          publish({ isEntering: false });
          entering = undefined;
        }
      })();
      return entering;
    },
  };
};
