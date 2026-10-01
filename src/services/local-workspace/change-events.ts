const listeners = new Map<string, Set<(paths?: readonly string[]) => void>>();

export const subscribeWorkspaceChanges = (
  projectId: string,
  listener: (paths?: readonly string[]) => void,
) => {
  const projectListeners =
    listeners.get(projectId) ?? new Set<(paths?: readonly string[]) => void>();
  projectListeners.add(listener);
  listeners.set(projectId, projectListeners);
  return () => {
    projectListeners.delete(listener);
    if (projectListeners.size === 0) listeners.delete(projectId);
  };
};

export const notifyWorkspaceChanged = (
  projectId: string,
  paths?: readonly string[],
) => {
  for (const listener of listeners.get(projectId) ?? []) {
    try {
      listener(paths);
    } catch {
      // A view notification must not turn a completed file write into a failure.
    }
  }
};
