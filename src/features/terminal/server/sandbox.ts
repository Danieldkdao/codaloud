import type { CreateSandboxFromSnapshotParams, Sandbox } from "@daytona/sdk";
// Metro's server bundle breaks the SDK's ESM tslib import. The SDK publishes
// a CommonJS entry for Node, which its conditional export selects for require.
const { Daytona, DaytonaNotFoundError } =
  require("@daytona/sdk") as typeof import("@daytona/sdk");
import type { SyncDownload } from "../lib/sync-download";
import { manifestScript, type ManifestMetrics } from "./manifest-script";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  maxSelectedSyncFileBytes,
  maxSyncFileBytes,
  maxSyncedFiles,
  maxSyncDownloadBatchBytes,
  syncDownloadBatchFiles,
  terminalSandboxSnapshot,
  terminalSandboxCpu,
  terminalSandboxMemoryGiB,
} from "../constants";
import {
  isSyncablePath,
  isSafeWorkspacePath,
  type WorkspaceManifest,
} from "../lib/sync-plan";

const sandboxIdSchema = z.string().min(1).max(200);
const projectIdSchema = z.uuid();
const deviceIdSchema = z.uuid();
const client = new Daytona({
  apiKey: serverEnv.DAYTONA_API_KEY,
  target: serverEnv.DAYTONA_TARGET,
});

export type SandboxOwner = {
  userId: string;
  deviceId: string;
  projectId: string;
};

type OnSandboxStart = (
  sandbox: Sandbox,
  previousVersion: string,
) => Promise<void>;

const unavailableResizes = new Map<string, number>();

const prepareSandbox = async (sandbox: Sandbox) => {
  let stoppedForResize = false;
  if (
    sandbox.cpu !== terminalSandboxCpu ||
    sandbox.memory !== terminalSandboxMemoryGiB
  ) {
    const decreasesResources =
      sandbox.cpu > terminalSandboxCpu ||
      sandbox.memory > terminalSandboxMemoryGiB;
    // Daytona permits live increases; reductions require stopping the sandbox.
    if (sandbox.state === "started" && decreasesResources) {
      await client.stop(sandbox);
      stoppedForResize = true;
    }
    if (
      decreasesResources ||
      (unavailableResizes.get(sandbox.id) ?? 0) <= Date.now()
    ) {
      try {
        await sandbox.resize({
          cpu: terminalSandboxCpu,
          memory: terminalSandboxMemoryGiB,
        });
        unavailableResizes.delete(sandbox.id);
      } catch (error) {
        // Some Daytona deployments lack this route; preserve their existing workspace.
        if (
          decreasesResources ||
          !(error instanceof DaytonaNotFoundError) ||
          !/^Cannot POST \/api\/sandbox\/[^/]+\/resize$/.test(error.message)
        )
          throw error;
        unavailableResizes.set(sandbox.id, Date.now() + 5 * 60_000);
        if (unavailableResizes.size > 32)
          unavailableResizes.delete(unavailableResizes.keys().next().value!);
      }
    }
  }
  if (sandbox.autoStopInterval !== 5) await sandbox.setAutostopInterval(5);
  return stoppedForResize;
};

const startSandbox = async (sandbox: Sandbox, onStart?: OnSandboxStart) => {
  const started = sandbox.state === "started";
  const previousVersion = sandbox.updatedAt ?? sandbox.createdAt ?? "initial";
  const deadline = Date.now() + 90_000;
  const remaining = () => {
    const seconds = (deadline - Date.now()) / 1000;
    if (seconds <= 0)
      throw new Error("Sandbox preparation timed out. Try again.");
    return seconds;
  };
  if (sandbox.state === "stopping") await sandbox.waitUntilStopped(remaining());
  else if (sandbox.state === "starting")
    await sandbox.waitUntilStarted(remaining());
  else if (sandbox.state === "resizing")
    await sandbox.waitForResizeComplete(remaining());
  const stoppedForResize = await prepareSandbox(sandbox);
  if (sandbox.state !== "started" || stoppedForResize) {
    try {
      await client.start(sandbox, remaining());
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/sandbox state change in progress/i.test(error.message)
      )
        throw error;
      await sandbox.refreshData();
      if (sandbox.state === "starting")
        await sandbox.waitUntilStarted(remaining());
      else if (sandbox.state !== "started") throw error;
    }
  }
  if ((!started || stoppedForResize) && onStart) {
    try {
      await onStart(sandbox, previousVersion);
    } catch (error) {
      await client.stop(sandbox).catch(() => undefined);
      throw error;
    }
  }
  return sandbox;
};

// Concurrent batches must share startup/resize work after each caller checks ownership.
const starting = new Map<string, Promise<Sandbox>>();
const startExisting = (sandbox: Sandbox, onStart?: OnSandboxStart) => {
  const pending = starting.get(sandbox.id);
  if (pending) return pending;
  const run = startSandbox(sandbox, onStart).finally(() =>
    starting.delete(sandbox.id),
  );
  starting.set(sandbox.id, run);
  return run;
};

const ownsSandbox = (sandbox: Sandbox, owner: SandboxOwner) =>
  sandbox.labels?.["codaloud.user"] === owner.userId &&
  sandbox.labels?.["codaloud.device"] === owner.deviceId &&
  sandbox.labels?.["codaloud.project"] === owner.projectId;

export class SandboxOwnershipError extends Error {}

export const findOwnedSandbox = async (
  sandboxId: string,
  owner: SandboxOwner,
) => {
  projectIdSchema.parse(owner.projectId);
  deviceIdSchema.parse(owner.deviceId);
  let sandbox: Sandbox;
  try {
    sandbox = await client.get(sandboxIdSchema.parse(sandboxId));
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) return null;
    throw error;
  }
  if (!ownsSandbox(sandbox, owner))
    throw new SandboxOwnershipError(
      "This sandbox does not belong to this project and device.",
    );
  return sandbox;
};

export const deleteProjectSandbox = async (
  sandboxId: string,
  owner: SandboxOwner,
) => {
  const sandbox = await findOwnedSandbox(sandboxId, owner);
  if (!sandbox) return;
  try {
    await client.delete(sandbox, 60);
  } catch (error) {
    if (!(error instanceof DaytonaNotFoundError)) throw error;
  }
};

export const checkedSandbox = async (
  sandboxId: string,
  owner: SandboxOwner,
  onStart?: OnSandboxStart,
) => {
  const sandbox = await client.get(sandboxIdSchema.parse(sandboxId));
  if (!ownsSandbox(sandbox, owner))
    throw new Error("This sandbox does not belong to this project and device.");
  return startExisting(sandbox, onStart);
};

export const ensureSandbox = async (
  owner: SandboxOwner,
  sandboxId: string | null,
  onStart?: OnSandboxStart,
) => {
  projectIdSchema.parse(owner.projectId);
  deviceIdSchema.parse(owner.deviceId);
  if (sandboxId) {
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await client.get(sandboxIdSchema.parse(sandboxId));
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error;
    }
    if (sandbox) {
      if (!ownsSandbox(sandbox, owner))
        throw new Error(
          "This sandbox does not belong to this project and device.",
        );
      // A failed start leaves the original persistent sandbox available to retry.
      return startExisting(sandbox, onStart);
    }
  }
  const params: CreateSandboxFromSnapshotParams = {
    snapshot: terminalSandboxSnapshot,
    language: "typescript",
    public: false,
    ephemeral: false,
    autoStopInterval: 5,
    autoArchiveInterval: 7 * 24 * 60,
    autoDeleteInterval: 30 * 24 * 60,
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  };
  const sandbox = await client.create(params);
  if (onStart) {
    try {
      await onStart(sandbox, sandbox.createdAt ?? "created");
    } catch (error) {
      await client.stop(sandbox).catch(() => undefined);
      throw error;
    }
  }
  return sandbox;
};

export const sandboxWorkspaceRoot = async (sandbox: Sandbox) => {
  const home = await sandbox.getUserHomeDir();
  if (!home || !home.startsWith("/"))
    throw new Error("The sandbox home directory is unavailable.");
  const root = `${home.replace(/\/$/, "")}/codaloud-workspace`;
  try {
    await sandbox.fs.getFileDetails(root);
  } catch {
    await sandbox.fs.createFolder(root, "700");
  }
  return root;
};

const safeRemotePath = (root: string, path: string) => {
  if (
    !isSafeWorkspacePath(path) ||
    path.split("/").some((part) => part.toLowerCase() === ".git")
  )
    throw new Error("Invalid workspace path.");
  return `${root}/${path}`;
};

const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

const fileHashScript = `const fs=require('fs'),crypto=require('crypto');
let fd;try{const file=process.argv[1],stat=fs.lstatSync(file,{bigint:true});
if(!stat.isFile()||stat.size>BigInt(${maxSelectedSyncFileBytes}))throw Error('Unsupported workspace file');
const key=s=>[s.size,s.mtimeNs,s.ctimeNs,s.ino,s.mode].join(':');
fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
if(key(fs.fstatSync(fd,{bigint:true}))!==key(stat))throw Error('Workspace file changed');
const hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);
for(;;){const count=fs.readSync(fd,buffer,0,buffer.length,null);if(!count)break;hash.update(buffer.subarray(0,count));}
if(key(fs.fstatSync(fd,{bigint:true}))!==key(stat)||key(fs.lstatSync(file,{bigint:true}))!==key(stat))throw Error('Workspace file changed');
console.log(hash.digest('hex'));
}catch(error){if(error.code==='ENOENT')console.log('missing');else throw error}
finally{if(fd!==undefined)fs.closeSync(fd)}`;

export const readSandboxFileHash = async (
  sandbox: Sandbox,
  root: string,
  path: string,
) => {
  const remote = safeRemotePath(root, path);
  const response = await sandbox.process.executeCommand(
    `node -e ${shellQuote(fileHashScript)} ${shellQuote(remote)}`,
    undefined,
    undefined,
    15,
  );
  if (response.exitCode !== 0)
    throw new Error("Unable to inspect the sandbox file.");
  const value = response.result.trim();
  return value === "missing"
    ? null
    : z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(value);
};

export const readSandboxManifestSnapshot = async (
  sandbox: Sandbox,
  root: string,
  allowedPaths: readonly string[] = [],
  knownHash?: string,
  onMetrics?: (metrics: ManifestMetrics) => void,
) => {
  const command = `node -e ${shellQuote(manifestScript)} ${shellQuote(root)} ${shellQuote(JSON.stringify(allowedPaths))} ${shellQuote(knownHash ?? "")}`;
  const response = await sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    120,
  );
  if (response.exitCode !== 0)
    throw new Error("Unable to inspect the sandbox workspace.");
  const responseData = z
    .object({
      manifest: z
        .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
        .optional(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      unchanged: z.boolean(),
      metrics: z.object({
        hashed: z.number(),
        reused: z.number(),
        bytesHashed: z.number(),
        durationMs: z.number(),
      }),
    })
    .parse(JSON.parse(response.result));
  const parsed = responseData.manifest;
  if (
    responseData.unchanged &&
    (!knownHash || responseData.hash !== knownHash || parsed !== undefined)
  )
    throw new Error("Invalid sandbox manifest fingerprint.");
  if (!responseData.unchanged && !parsed)
    throw new Error("The sandbox returned no workspace manifest.");
  if (
    parsed &&
    (Object.keys(parsed).length > maxSyncedFiles ||
      Object.keys(parsed).some((path) => !isSyncablePath(path, allowedPaths)))
  )
    throw new Error("The sandbox workspace contains unsupported paths.");
  onMetrics?.(responseData.metrics);
  return responseData;
};

export const readSandboxManifest = async (
  sandbox: Sandbox,
  root: string,
  allowedPaths: readonly string[] = [],
  onMetrics?: (metrics: ManifestMetrics) => void,
): Promise<WorkspaceManifest> =>
  (
    await readSandboxManifestSnapshot(
      sandbox,
      root,
      allowedPaths,
      undefined,
      onMetrics,
    )
  ).manifest!;

export const uploadSandboxFile = async (
  sandbox: Sandbox,
  root: string,
  path: string,
  bytes: Uint8Array,
) => {
  if (bytes.byteLength > maxSelectedSyncFileBytes)
    throw new Error("This file exceeds the 128 MiB selected-file sync limit.");
  const remote = safeRemotePath(root, path);
  const directories = path.split("/").slice(0, -1);
  let parent = root;
  for (const segment of directories) {
    parent += `/${segment}`;
    try {
      await sandbox.fs.getFileDetails(parent);
    } catch {
      await sandbox.fs.createFolder(parent, "700");
    }
  }
  await sandbox.fs.uploadFiles([
    { source: Buffer.from(bytes), destination: remote },
  ]);
};

export const downloadSandboxFile = async (
  sandbox: Sandbox,
  root: string,
  path: string,
) => {
  const remote = safeRemotePath(root, path);
  const details = await sandbox.fs.getFileDetails(remote);
  if (details.isDir || details.size > maxSelectedSyncFileBytes)
    throw new Error("This file cannot be downloaded to the project.");
  return sandbox.fs.downloadFile(remote, 60);
};

export const deleteSandboxFile = async (
  sandbox: Sandbox,
  root: string,
  path: string,
) => sandbox.fs.deleteFile(safeRemotePath(root, path));

const downloadMetadataScript = `const fs=require('fs'),path=require('path');
const root=process.argv[1],names=JSON.parse(process.argv[2]);let remaining=${maxSyncDownloadBatchBytes};
console.log(JSON.stringify(names.map(name=>{try{
const full=path.join(root,name);let current=root;
for(const part of name.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Symbolic links cannot be synced');}
const stat=fs.statSync(full);if(!stat.isFile()||stat.size>${maxSelectedSyncFileBytes})throw Error('Unsupported workspace file');
if(stat.size>remaining)return {path:name,size:stat.size,individual:true};remaining-=stat.size;return {path:name,size:stat.size};
}catch(error){return {path:name,size:0,error:String(error.message).slice(0,200)}}})));`;

export const downloadSandboxFiles = async (
  sandbox: Sandbox,
  root: string,
  paths: readonly string[],
): Promise<SyncDownload[]> => {
  if (
    paths.length > syncDownloadBatchFiles ||
    new Set(paths).size !== paths.length
  )
    throw new Error("Invalid download batch.");
  for (const path of paths) safeRemotePath(root, path);
  const metadata = await sandbox.process.executeCommand(
    `node -e ${shellQuote(downloadMetadataScript)} ${shellQuote(root)} ${shellQuote(JSON.stringify(paths))}`,
    undefined,
    undefined,
    30,
  );
  if (metadata.exitCode !== 0)
    throw new Error("Unable to inspect sandbox downloads.");
  const entries = z
    .array(
      z.object({
        path: z.string(),
        size: z.number().int().min(0),
        error: z.string().optional(),
        individual: z.boolean().optional(),
      }),
    )
    .parse(JSON.parse(metadata.result));
  if (
    entries.length !== paths.length ||
    entries.some((entry, index) => entry.path !== paths[index])
  )
    throw new Error("Invalid sandbox download metadata.");
  const small = entries.filter((entry) => !entry.error && !entry.individual);
  if (
    small.reduce((total, entry) => total + entry.size, 0) >
    maxSyncDownloadBatchBytes
  )
    throw new Error("Sandbox download batch exceeds the size limit.");
  const downloaded = await sandbox.fs.downloadFiles(
    small.map((entry) => ({ source: safeRemotePath(root, entry.path) })),
    60,
  );
  const byPath = new Map(downloaded.map((file) => [file.source, file]));
  return entries.map((entry): SyncDownload => {
    if (entry.error) return { path: entry.path, error: entry.error };
    if (entry.individual)
      return { path: entry.path, individual: true, fileSize: entry.size };
    const file = byPath.get(safeRemotePath(root, entry.path));
    if (!file || file.error || !(file.result instanceof Uint8Array))
      return {
        path: entry.path,
        error: file?.error?.slice(0, 200) ?? "Sandbox download failed.",
      };
    if (file.result.byteLength !== entry.size)
      return { path: entry.path, error: "Sandbox file changed during sync." };
    return { path: entry.path, bytes: file.result };
  });
};
