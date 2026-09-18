export type DeviceWorkspace = { ownerId: string; hasEntered: boolean };

export type WorkspaceSnapshot = {
  ready: boolean;
  workspace: DeviceWorkspace | null;
  error: string | null;
  isEntering: boolean;
};

export type WorkspaceStorage = {
  load: () => Promise<DeviceWorkspace>;
  enter: () => Promise<DeviceWorkspace>;
};
