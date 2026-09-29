export type WorkspaceManifest = Record<string, string>;

export type WorkspaceSyncPlan = {
  upload: string[];
  download: string[];
  deleteLocal: string[];
  deleteRemote: string[];
  conflicts: string[];
};

const excluded = new Set([
  ".git",
  ".expo",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
]);

export const isSyncablePath = (path: string) =>
  path.length > 0 &&
  path.length <= 4096 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  path
    .split("/")
    .every((segment) =>
      Boolean(
        segment &&
        segment !== "." &&
        segment !== ".." &&
        !excluded.has(segment),
      ),
    );

/** The phone is canonical; concurrent edits remain untouched until resolved. */
export const planWorkspaceSync = (
  local: WorkspaceManifest,
  remote: WorkspaceManifest,
  baseline: WorkspaceManifest,
): WorkspaceSyncPlan => {
  const result: WorkspaceSyncPlan = {
    upload: [],
    download: [],
    deleteLocal: [],
    deleteRemote: [],
    conflicts: [],
  };
  const paths = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
    ...Object.keys(baseline),
  ]);
  for (const path of [...paths].sort()) {
    if (!isSyncablePath(path)) continue;
    const device = local[path];
    const sandbox = remote[path];
    const previous = baseline[path];
    if (device === sandbox) continue;
    const localChanged = device !== previous;
    const remoteChanged = sandbox !== previous;
    if (localChanged && remoteChanged) result.conflicts.push(path);
    else if (localChanged)
      result[device === undefined ? "deleteRemote" : "upload"].push(path);
    else if (remoteChanged)
      result[sandbox === undefined ? "deleteLocal" : "download"].push(path);
  }
  return result;
};
