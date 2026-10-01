import { Directory, File, FileMode } from "expo-file-system";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { subscribeWorkspaceChanges } from "@/services/local-workspace/change-events";
import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { yieldToEvents } from "@/lib/yield-to-events";
import { flushAgentWorkspace } from "@/features/agent/workspace-access";
import { getLocalProjects } from "@/features/projects/local/access";
import { readLocalFilePaths } from "@/features/projects/local/file-paths";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import {
  parsePathRules,
  pathMatchesRule,
  pathRulesAreValid,
} from "@/features/settings/lib/path-rules";
import {
  projectWorkspaceDirectory,
  projectWorkspaceFile,
} from "@/features/projects/lib/workspace-paths";
import {
  isSyncablePath,
  isReservedSyncRule,
  planWorkspaceSync,
  type WorkspaceManifest,
} from "../lib/sync-plan";
import {
  getTerminalDeviceId,
  terminalApi,
  type ManifestDiagnostics,
} from "./terminal-client";
import {
  maxSyncedFiles,
  maxSyncFileBytes,
  maxSelectedSyncFileBytes,
  maxSyncDownloadBatchBytes,
  maxSyncDownloadHeaderBytes,
  syncTransferConcurrency,
  syncDownloadBatchFiles,
  syncDownloadConcurrency,
} from "../constants";

const manifestHashPattern = /^[a-f0-9]{64}$/;
const manifestSchema = z.custom<WorkspaceManifest>((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const manifest = value as Record<string, unknown>;
  let count = 0;
  for (const path in manifest) {
    if (!Object.prototype.hasOwnProperty.call(manifest, path)) continue;
    if (
      ++count > maxSyncedFiles ||
      typeof manifest[path] !== "string" ||
      !manifestHashPattern.test(manifest[path])
    )
      return false;
  }
  return true;
}, "Invalid workspace manifest.");
const cache = new Map<
  string,
  Map<
    string,
    { size: number; modified: number | null; hash: string; checkedAt: number }
  >
>();
const retainHashCache = (
  projectId: string,
  entries: NonNullable<ReturnType<typeof cache.get>>,
) => {
  cache.delete(projectId);
  cache.set(projectId, entries);
  // Persisted hints remain available when an inactive project leaves memory.
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
};
const cacheSubscriptions = new Set<string>();
const cacheGenerations = new Map<string, number>();
const hashCacheKey = (projectId: string) =>
  `codaloud.terminal.hash-cache.${projectId}`;
const hashCacheSchema = z.record(
  z.string(),
  z.object({
    size: z.number().nonnegative(),
    modified: z.number().nullable(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    checkedAt: z.number(),
  }),
);
const watchHashCache = (projectId: string) => {
  if (!cacheSubscriptions.has(projectId)) {
    cacheSubscriptions.add(projectId);
    subscribeWorkspaceChanges(projectId, (paths) => {
      cacheGenerations.set(
        projectId,
        (cacheGenerations.get(projectId) ?? 0) + 1,
      );
      const entries = cache.get(projectId);
      if (paths && entries) {
        for (const path of paths)
          for (const name of entries.keys())
            if (name === path || name.startsWith(`${path}/`))
              entries.delete(name);
      } else cache.delete(projectId);
      // Remove persisted hints immediately so a reload cannot reuse a stale hash.
      Storage.removeItemSync(hashCacheKey(projectId));
    });
  }
};
const loadHashCache = async (projectId: string) => {
  watchHashCache(projectId);
  if (cache.has(projectId)) return;
  const generation = cacheGenerations.get(projectId) ?? 0;
  try {
    const saved = await Storage.getItem(hashCacheKey(projectId));
    const parsed = hashCacheSchema.safeParse(JSON.parse(saved ?? "{}"));
    if (parsed.success && generation === (cacheGenerations.get(projectId) ?? 0))
      retainHashCache(
        projectId,
        new Map(
          Object.entries(parsed.data).filter(
            ([, entry]) => entry.modified !== null,
          ),
        ),
      );
  } catch {
    // Cache corruption or storage failure requires a fresh hash, never data loss.
  }
};
const inFlight = new Map<string, Promise<SyncResult>>();
const ensuring = new Map<string, Promise<string>>();
const progressListeners = new Map<string, Set<(message: string) => void>>();
const reportProgress = (projectId: string, message: string) => {
  for (const listener of progressListeners.get(projectId) ?? [])
    listener(message);
};
const hashBytes = async (bytes: Uint8Array) => {
  const hash = sha256.create();
  for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
    hash.update(bytes.subarray(offset, offset + 256 * 1024));
    if (offset + 256 * 1024 < bytes.length) await yieldToEvents();
  }
  return bytesToHex(hash.digest());
};
const hashLocalFile = async (file: File) => {
  const handle = file.open(FileMode.ReadOnly);
  const digest = sha256.create();
  let yieldedAt = Date.now();
  try {
    for (;;) {
      const bytes = handle.readBytes(256 * 1024);
      if (bytes.length === 0) break;
      digest.update(bytes);
      if (Date.now() - yieldedAt >= 8) {
        await yieldToEvents();
        yieldedAt = Date.now();
      }
    }
    return bytesToHex(digest.digest());
  } finally {
    handle.close();
  }
};

export const ensureProjectSandbox = (projectId: string): Promise<string> => {
  const existing = ensuring.get(projectId);
  if (existing) return existing;
  const run = (async () => {
    const projects = await getLocalProjects();
    if (!projects.read(projectId))
      throw new Error("Project unavailable on this device.");
    const deviceId = await getTerminalDeviceId();
    const previousId = projects.getSandboxId(projectId);
    let sandboxId: string;
    try {
      sandboxId = await terminalApi.ensure(projectId, deviceId, previousId);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("does not belong")
      )
        throw error;
      sandboxId = await terminalApi.ensure(projectId, deviceId, null);
    }
    if (sandboxId !== previousId) projects.setSandboxId(projectId, sandboxId);
    return sandboxId;
  })().finally(() => ensuring.delete(projectId));
  ensuring.set(projectId, run);
  return run;
};
const baselineKey = (projectId: string, sandboxId: string) =>
  `codaloud.terminal.baseline.${projectId}.${sandboxId}`;

export type SyncResult = {
  sandboxId: string;
  allowedPaths: string[];
  remoteManifest: WorkspaceManifest;
  conflicts: string[];
  failures: string[];
  failureReasons: Record<string, string>;
  uploaded: number;
  uploadedPaths: string[];
  downloaded: number;
  deleted: number;
  localDeleted: number;
  downloadedPaths: string[];
  localDeletedPaths: string[];
};

const nativeManifestSchema = z.object({
  manifest: manifestSchema,
  metrics: z.object({
    hashed: z.number().int().nonnegative(),
    reused: z.number().int().nonnegative(),
    bytesHashed: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
});
export type NativeManifestSchema = z.infer<typeof nativeManifestSchema>;

const hashLocalFiles = async (
  projectId: string,
  allowedPaths: readonly string[],
): Promise<WorkspaceManifest> => {
  watchHashCache(projectId);
  const generation = cacheGenerations.get(projectId) ?? 0;
  try {
    const scan = nativeManifestSchema.parse(
      await executeWorkspace(projectId, "sync-manifest", {
        allowedPaths: [...allowedPaths],
      }),
    );
    if (generation !== (cacheGenerations.get(projectId) ?? 0))
      throw new Error(
        "Device workspace changed while checking files. Try syncing again.",
      );
    if (
      Object.keys(scan.manifest).length > maxSyncedFiles ||
      Object.keys(scan.manifest).some(
        (path) => !isSyncablePath(path, allowedPaths),
      )
    )
      throw new Error("The device returned an invalid workspace manifest.");
    try {
      Storage.setItemSync(
        `codaloud.terminal.last-scan.${projectId}`,
        JSON.stringify(scan.metrics),
      );
    } catch {
      /* Metrics are optional. */
    }
    return scan.manifest;
  } catch (error) {
    // Older installed binaries retain the compatible scanner until rebuilt.
    if (
      !(error instanceof LocalWorkspaceError) ||
      error.code !== "UNKNOWN_OPERATION"
    )
      throw error;
  }
  await loadHashCache(projectId);
  const paths = (
    await readLocalFilePaths(projectId, undefined, {
      visitDirectory: (path) => isSyncablePath(path, allowedPaths),
      maxEntries: maxSyncedFiles * 2,
      scanTimeoutMs: 60_000,
    })
  ).filter((path) => isSyncablePath(path, allowedPaths));
  if (paths.length > maxSyncedFiles)
    throw new Error(
      `This project exceeds the ${maxSyncedFiles.toLocaleString()}-file sync limit.`,
    );
  const previous = cache.get(projectId) ?? new Map();
  const next = new Map<
    (typeof paths)[number],
    { size: number; modified: number | null; hash: string; checkedAt: number }
  >();
  const manifest: WorkspaceManifest = {};
  let processed = 0;
  let yieldedAt = Date.now();
  for (const path of paths) {
    ++processed;
    if (Date.now() - yieldedAt >= 8) {
      reportProgress(
        projectId,
        `Checking device files: ${processed.toLocaleString()} / ${paths.length.toLocaleString()}`,
      );
      await yieldToEvents();
      yieldedAt = Date.now();
    }
    const file = projectWorkspaceFile(projectId, path);
    const info = file.info();
    if (!info.exists) continue;
    const size = info.size ?? 0;
    if (size > maxSyncFileBytes) {
      if (!pathMatchesRule(path, allowedPaths)) continue;
      if (size > maxSelectedSyncFileBytes)
        throw new Error(
          `${path} exceeds the 128 MiB selected-file sync limit.`,
        );
    }
    const modified = info.modificationTime ?? null;
    const old = previous.get(path);
    const hash =
      old &&
      old.size === size &&
      old.modified === modified &&
      (modified !== null || Date.now() - old.checkedAt < 10_000)
        ? old.hash
        : await hashLocalFile(file);
    const after = file.info();
    if (
      !after.exists ||
      after.size !== info.size ||
      after.modificationTime !== info.modificationTime
    )
      throw new Error(
        "Device workspace changed while checking files. Try syncing again.",
      );
    manifest[path] = hash;
    next.set(path, { size, modified, hash, checkedAt: Date.now() });
  }
  if (generation !== (cacheGenerations.get(projectId) ?? 0))
    throw new Error(
      "Device workspace changed while checking files. Try syncing again.",
    );
  retainHashCache(projectId, next);
  // Keep invalidation and the persisted hints ordered on the JS thread.
  try {
    Storage.setItemSync(
      hashCacheKey(projectId),
      JSON.stringify(Object.fromEntries(next)),
    );
  } catch {
    /* Hints are optional. */
  }
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

const transferPaths = async (
  paths: readonly string[],
  sizeOf: (path: string) => number,
  transfer: (path: string) => Promise<void>,
) => {
  let offset = 0;
  while (offset < paths.length) {
    const batch: string[] = [];
    let bytes = 0;
    while (offset < paths.length && batch.length < syncTransferConcurrency) {
      const size = sizeOf(paths[offset]);
      if (batch.length && bytes + size > maxSyncDownloadBatchBytes) break;
      batch.push(paths[offset++]);
      bytes += size;
      if (bytes >= maxSyncDownloadBatchBytes) break;
    }
    await Promise.all(batch.map(transfer));
    await yieldToEvents();
  }
};

const runSync = async (projectId: string): Promise<SyncResult> => {
  const started = Date.now();
  await flushAgentWorkspace(projectId);
  await editorPreferencesStore.load();
  const preferences = editorPreferencesStore.getSnapshot().preferences;
  if (
    preferences.allowLargeSync &&
    !pathRulesAreValid(preferences.syncAllowedPaths)
  )
    throw new Error(
      "Invalid allowed sync paths. Fix the list in Editor Settings.",
    );
  const allowedPaths = preferences.allowLargeSync
    ? parsePathRules(preferences.syncAllowedPaths)
    : [];
  if (allowedPaths.some(isReservedSyncRule))
    throw new Error(
      "Git metadata is managed by the app and cannot be synced as project files.",
    );
  reportProgress(projectId, "Starting the sandbox…");
  const sandboxId = await ensureProjectSandbox(projectId);
  const deviceId = await getTerminalDeviceId();
  const key = baselineKey(projectId, sandboxId);
  const baseline = manifestSchema.parse(
    JSON.parse((await Storage.getItem(key)) ?? "{}"),
  );
  reportProgress(projectId, "Checking project files…");
  const scanStarted = Date.now();
  let localScanMs = 0,
    remoteScanMs = 0;
  let remoteDiagnostics: ManifestDiagnostics | undefined;
  const [local, remote] = await Promise.all([
    hashLocalFiles(projectId, allowedPaths).then((manifest) => {
      localScanMs = Date.now() - scanStarted;
      return manifest;
    }),
    terminalApi
      .manifest(
        projectId,
        deviceId,
        sandboxId,
        allowedPaths,
        baseline,
        (metrics) => {
          remoteDiagnostics = metrics;
        },
      )
      .then((manifest) => {
        remoteScanMs = Date.now() - scanStarted;
        return manifest;
      }),
  ]);
  const plan = planWorkspaceSync(local, remote, baseline, allowedPaths);
  const failures: string[] = [];
  const failureReasons: Record<string, string> = {};
  const recordFailure = (path: string, error: unknown) => {
    failures.push(path);
    failureReasons[path] =
      error instanceof Error ? error.message.slice(0, 200) : "Sync failed.";
  };
  let uploaded = 0;
  const uploadedPaths: string[] = [];
  let downloaded = 0;
  let deleted = 0;
  let localDeleted = 0;
  const downloadedPaths: string[] = [];
  const localDeletedPaths: string[] = [];
  const individualDownloads: string[] = [];
  let downloadBatchRequests = 0,
    individualDownloadRequests = 0,
    downloadedBytes = 0,
    lastDownloadProgress = 0;
  const transferStarted = Date.now();
  if (
    plan.upload.length ||
    plan.download.length ||
    plan.deleteRemote.length ||
    plan.deleteLocal.length
  ) {
    // A concurrent project can evict memory hints while this transfer writes files.
    try {
      Storage.removeItemSync(hashCacheKey(projectId));
    } catch {
      /* Hints are optional. */
    }
  }
  if (plan.upload.length)
    reportProgress(
      projectId,
      `Uploading 0 / ${plan.upload.length.toLocaleString()} files…`,
    );
  await transferPaths(
    plan.upload,
    (path) => projectWorkspaceFile(projectId, path).size ?? 0,
    async (path) => {
      try {
        const bytes = await projectWorkspaceFile(projectId, path).bytes();
        if ((await hashBytes(bytes)) !== local[path])
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
        uploadedPaths.push(path);
        reportProgress(
          projectId,
          `Uploading ${uploaded.toLocaleString()} / ${plan.upload.length.toLocaleString()} files…`,
        );
      } catch (error) {
        recordFailure(path, error);
      }
    },
  );
  if (plan.download.length)
    reportProgress(
      projectId,
      `Downloading 0 / ${plan.download.length.toLocaleString()} files…`,
    );
  const storeDownload = async (path: string, bytes: Uint8Array) => {
    try {
      const file = projectWorkspaceFile(projectId, path);
      if ((await hashBytes(bytes)) !== remote[path])
        throw new Error("Sandbox file changed during sync.");
      if (file.exists && (await hashLocalFile(file)) !== local[path])
        throw new Error("Local file changed during sync.");
      ensureLocalParent(projectId, path);
      if (!file.exists) file.create({ overwrite: false });
      file.write(bytes);
      cache.get(projectId)?.set(path, {
        size: bytes.byteLength,
        modified: file.modificationTime ?? null,
        hash: remote[path],
        checkedAt: Date.now(),
      });
      downloaded++;
      downloadedBytes += bytes.byteLength;
      downloadedPaths.push(path);
      if (
        downloaded === plan.download.length ||
        Date.now() - lastDownloadProgress >= 100
      ) {
        lastDownloadProgress = Date.now();
        reportProgress(
          projectId,
          `Downloading ${downloaded.toLocaleString()} / ${plan.download.length.toLocaleString()} files…`,
        );
      }
    } catch (error) {
      recordFailure(path, error);
    }
  };
  let downloadOffset = 0;
  const downloadBatch = async (
    paths: string[],
    retryOverflow = true,
  ): Promise<void> => {
    downloadBatchRequests++;
    const files = await terminalApi.downloadBatch(
      projectId,
      deviceId,
      sandboxId,
      paths,
    );
    const overflow: { path: string; size: number }[] = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if ("error" in file) recordFailure(file.path, new Error(file.error));
      else if ("individual" in file) {
        if (
          retryOverflow &&
          file.fileSize !== undefined &&
          file.fileSize <= maxSyncDownloadBatchBytes
        )
          overflow.push({ path: file.path, size: file.fileSize });
        else individualDownloads.push(file.path);
      } else await storeDownload(file.path, file.bytes);
      if (index % 8 === 7) await yieldToEvents();
    }
    // Release the first response before fetching its overflow; keep the byte cap.
    files.length = 0;
    let retryPaths: string[] = [],
      retryBytes = 0;
    for (const file of overflow) {
      if (
        retryPaths.length &&
        retryBytes + file.size > maxSyncDownloadBatchBytes
      ) {
        await downloadBatch(retryPaths, false);
        retryPaths = [];
        retryBytes = 0;
      }
      retryPaths.push(file.path);
      retryBytes += file.size;
    }
    if (retryPaths.length) await downloadBatch(retryPaths, false);
  };
  const downloadWorker = async () => {
    while (downloadOffset < plan.download.length) {
      const paths: string[] = [];
      let headerBytes = 2;
      while (
        downloadOffset < plan.download.length &&
        paths.length < syncDownloadBatchFiles
      ) {
        const path = plan.download[downloadOffset];
        const entryBytes =
          new TextEncoder().encode(JSON.stringify(path)).length + 320;
        if (
          paths.length &&
          headerBytes + entryBytes > maxSyncDownloadHeaderBytes
        )
          break;
        paths.push(path);
        downloadOffset++;
        headerBytes += entryBytes;
      }
      await downloadBatch(paths);
      await yieldToEvents();
    }
  };
  // Settle every worker before releasing the project lock, even on a timeout.
  const workers = await Promise.allSettled(
    Array.from(
      {
        length: Math.min(
          syncDownloadConcurrency,
          Math.ceil(plan.download.length / syncDownloadBatchFiles),
        ),
      },
      downloadWorker,
    ),
  );
  const failedWorker = workers.find((worker) => worker.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;
  // Large files cannot overlap each other or retained batch buffers.
  for (const path of individualDownloads) {
    try {
      individualDownloadRequests++;
      reportProgress(
        projectId,
        `Downloading ${downloaded.toLocaleString()} / ${plan.download.length.toLocaleString()} files: ${path}`,
      );
      await storeDownload(
        path,
        await terminalApi.download(projectId, deviceId, sandboxId, path),
      );
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
      if (file.exists && (await hashLocalFile(file)) !== local[path])
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
  const transferred =
    plan.upload.length +
      plan.download.length +
      plan.deleteRemote.length +
      plan.deleteLocal.length >
    0;
  const transferMs = Date.now() - transferStarted;
  if (transferred) reportProgress(projectId, "Verifying synced files…");
  const [nextLocal, nextRemote] = transferred
    ? await Promise.all([
        hashLocalFiles(projectId, allowedPaths),
        terminalApi.manifest(
          projectId,
          deviceId,
          sandboxId,
          allowedPaths,
          remote,
        ),
      ])
    : [local, remote];
  for (const path of plan.upload) {
    if (nextRemote[path] !== nextLocal[path] && !failureReasons[path])
      recordFailure(
        path,
        new Error("Upload was not confirmed in the sandbox."),
      );
  }
  let nextBase = baseline;
  for (const path of new Set([
    ...Object.keys(nextLocal),
    ...Object.keys(nextRemote),
    ...Object.keys(baseline),
  ])) {
    if (nextLocal[path] !== nextRemote[path]) continue;
    if (nextLocal[path] === baseline[path]) continue;
    if (nextBase === baseline) nextBase = { ...baseline };
    if (nextLocal[path] === undefined) delete nextBase[path];
    else nextBase[path] = nextLocal[path];
  }
  if (nextBase !== baseline)
    await Storage.setItem(key, JSON.stringify(nextBase));
  try {
    Storage.setItemSync(
      `codaloud.terminal.last-sync.${projectId}`,
      JSON.stringify({
        durationMs: Date.now() - started,
        setupMs: scanStarted - started,
        localScanMs,
        remoteScanMs,
        remoteDiagnostics,
        uploaded,
        downloaded,
        downloadedBytes,
        downloadBatchRequests,
        individualDownloadRequests,
        transferMs,
        deleted,
        conflicts: plan.conflicts.length,
        failures: failures.length,
      }),
    );
  } catch {
    /* Diagnostics are optional and contain no file contents. */
  }
  return {
    sandboxId,
    allowedPaths,
    remoteManifest: nextRemote,
    conflicts: plan.conflicts,
    failures,
    failureReasons,
    uploaded,
    uploadedPaths,
    downloaded,
    deleted,
    localDeleted,
    downloadedPaths,
    localDeletedPaths,
  };
};

/** One sync per project; render effects and simultaneous agents share the run. */
export const syncProjectWorkspace = (
  projectId: string,
  onProgress?: (message: string) => void,
) => {
  if (onProgress) {
    const listeners = progressListeners.get(projectId) ?? new Set();
    listeners.add(onProgress);
    progressListeners.set(projectId, listeners);
  }
  const existing = inFlight.get(projectId);
  if (existing) return existing;
  const run = runSync(projectId).finally(() => {
    inFlight.delete(projectId);
    progressListeners.delete(projectId);
  });
  inFlight.set(projectId, run);
  return run;
};
