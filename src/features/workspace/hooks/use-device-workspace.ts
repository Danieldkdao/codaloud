import { useEffect, useSyncExternalStore } from "react";
import { createWorkspaceState } from "../state";
import { workspaceStorage } from "../storage";

const state = createWorkspaceState(workspaceStorage);

export const getDeviceWorkspace = async () => {
  await state.load();
  const { workspace, error } = state.getSnapshot();
  if (!workspace) throw new Error(error ?? "The local workspace is not ready.");
  return workspace;
};

export const useDeviceWorkspace = () => {
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  useEffect(() => { void state.load(); }, []);
  return { ...snapshot, retry: state.load, enter: state.enter };
};
