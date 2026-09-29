import { Directory, File } from "expo-file-system";
import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import { sha256Bytes } from "@/lib/hashes";
import { flushAgentWorkspace } from "@/features/agent/workspace-access";
import { getLocalProjects } from "@/features/projects/local/access";
import { readLocalFilePaths } from "@/features/projects/local/file-paths";
import {
  projectWorkspaceDirectory,
  projectWorkspaceFile,
} from "@/features/projects/lib/workspace-paths";
import {
  isSyncablePath,
  planWorkspaceSync,
  type WorkspaceManifest,
} from "../lib/sync-plan";
import { getTerminalDeviceId, terminalApi } from "./terminal-client";

const manifestSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));
const cache = new Map<
  string,
  Map<
    string,
    { size: number; modified: number | null; hash: string; checkedAt: number }
  >
>();
const inFlight = new Map<string, Promise<SyncResult>>();
const baselineKey = (projectId: string, sandboxId: string) =>
  `codaloud.terminal.baseline.${projectId}.${sandboxId}`;

export type SyncResult = {
  sandboxId: string;
  conflicts: string[];
  failures: string[];
  failureReasons: Record<string, string>;
  uploaded: number;
  downloaded: number;
  deleted: number;
  localDeleted: number;
  downloadedPaths: string[];
  localDeletedPaths: string[];
};

const hashLocalFiles = async (
  projectId: string,
): Promise<WorkspaceManifest> => {
  const paths = (await readLocalFilePaths(projectId)).filter(isSyncablePath);
  if (paths.length > 5000)
    throw new Error("This project has too many files to sync.");
  const previous = cache.get(projectId) ?? new Map();
  const next = new Map<
    (typeof paths)[number],
    { size: number; modified: number | null; hash: string; checkedAt: number }
  >();
  const manifest: WorkspaceManifest = {};
  for (const path of paths) {
    const file = projectWorkspaceFile(projectId, path);
    if (!file.exists) continue;
    if (file.size > 32 * 1024 * 1024)
      throw new Error(`${path} exceeds the 32 MiB sync limit.`);
    const size = file.size;
    const modified = file.lastModified ?? null;
    const old = previous.get(path);
    const hash =
      old &&
      old.size === size &&
      old.modified === modified &&
      Date.now() - old.checkedAt < 10_000
        ? old.hash
        : sha256Bytes(await file.bytes());
    manifest[path] = hash;
    next.set(path, { size, modified, hash, checkedAt: Date.now() });
  }
  cache.set(projectId, next);
  return manifest;
};

const ensureLocalParent = (projectId: string, path: string) => {
  const parts = path.split("/").slice(0, -1);
  if (parts.length === 0) return;
  new Directory(projectWorkspaceDirectory(projectId), ...parts).create({
    intermediates: true,
    idempotent: true,
  });
};

const runSync = async (projectId: string): Promise<SyncResult> => {
  await flushAgentWorkspace(projectId);
  const projects = await getLocalProjects();
  if (!projects.read(projectId))
    throw new Error("Project unavailable on this device.");
  const deviceId = await getTerminalDeviceId();
  let previousId = projects.getSandboxId(projectId);
  let sandboxId: string;
  try {
    sandboxId = await terminalApi.ensure(projectId, deviceId, previousId);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("does not belong"))
      throw error;
    previousId = null;
    sandboxId = await terminalApi.ensure(projectId, deviceId, null);
  }
  if (sandboxId !== previousId) projects.setSandboxId(projectId, sandboxId);
  const key = baselineKey(projectId, sandboxId);
  const baseline = manifestSchema.parse(
    JSON.parse((await Storage.getItem(key)) ?? "{}"),
  );
  const [local, remote] = await Promise.all([
    hashLocalFiles(projectId),
    terminalApi.manifest(projectId, deviceId, sandboxId),
  ]);
  const plan = planWorkspaceSync(local, remote, baseline);
  const failures: string[] = [];
  const failureReasons: Record<string, string> = {};
  const recordFailure = (path: string, error: unknown) => {
    failures.push(path);
    failureReasons[path] =
      error instanceof Error ? error.message.slice(0, 200) : "Sync failed.";
  };
  let uploaded = 0;
  let downloaded = 0;
  let deleted = 0;
  let localDeleted = 0;
  const downloadedPaths: string[] = [];
  const localDeletedPaths: string[] = [];
  for (const path of plan.upload) {
    try {
      const bytes = await projectWorkspaceFile(projectId, path).bytes();
      if (sha256Bytes(bytes) !== local[path])
        throw new Error("Local file changed during sync.");
      await terminalApi.upload(
        projectId,
        deviceId,
        sandboxId,
        path,
        bytes,
        remote[path],
      );
      uploaded++;
    } catch (error) {
      recordFailure(path, error);
    }
  }
  for (const path of plan.download) {
    try {
      const file = projectWorkspaceFile(projectId, path);
      const bytes = await terminalApi.download(
        projectId,
        deviceId,
        sandboxId,
        path,
      );
      if (sha256Bytes(bytes) !== remote[path])
        throw new Error("Sandbox file changed during sync.");
      if (file.exists && sha256Bytes(await file.bytes()) !== local[path])
        throw new Error("Local file changed during sync.");
      ensureLocalParent(projectId, path);
      if (!file.exists) file.create({ overwrite: false });
      file.write(bytes);
      cache.get(projectId)?.delete(path);
      downloaded++;
      downloadedPaths.push(path);
    } catch (error) {
      recordFailure(path, error);
    }
  }
  for (const path of plan.deleteRemote) {
    try {
      await terminalApi.delete(
        projectId,
        deviceId,
        sandboxId,
        path,
        remote[path],
      );
      deleted++;
    } catch (error) {
      recordFailure(path, error);
    }
  }
  for (const path of plan.deleteLocal) {
    try {
      const file = projectWorkspaceFile(projectId, path);
      if (file.exists && sha256Bytes(await file.bytes()) !== local[path])
        throw new Error("Local path changed during sync.");
      if (file.exists) file.delete();
      cache.get(projectId)?.delete(path);
      deleted++;
      localDeleted++;
      localDeletedPaths.push(path);
    } catch (error) {
      recordFailure(path, error);
    }
  }
  // Verify both sides after transfers. Only matching paths advance the common
  // ancestor; unresolved conflicts keep their old base for the next sync.
  const [nextLocal, nextRemote] = await Promise.all([
    hashLocalFiles(projectId),
    terminalApi.manifest(projectId, deviceId, sandboxId),
  ]);
  for (const path of plan.upload) {
    if (nextRemote[path] !== nextLocal[path] && !failureReasons[path])
      recordFailure(
        path,
        new Error("Upload was not confirmed in the sandbox."),
      );
  }
  const nextBase: WorkspaceManifest = { ...baseline };
  for (const path of new Set([
    ...Object.keys(nextLocal),
    ...Object.keys(nextRemote),
    ...Object.keys(baseline),
  ])) {
    if (nextLocal[path] !== nextRemote[path]) continue;
    if (nextLocal[path] === undefined) delete nextBase[path];
    else nextBase[path] = nextLocal[path];
  }
  await Storage.setItem(key, JSON.stringify(nextBase));
  return {
    sandboxId,
    conflicts: plan.conflicts,
    failures,
    failureReasons,
    uploaded,
    downloaded,
    deleted,
    localDeleted,
    downloadedPaths,
    localDeletedPaths,
  };
};

/** One sync per project; render effects and simultaneous agents share the run. */
export const syncProjectWorkspace = (projectId: string) => {
  const existing = inFlight.get(projectId);
  if (existing) return existing;
  const run = runSync(projectId).finally(() => inFlight.delete(projectId));
  inFlight.set(projectId, run);
  return run;
};
