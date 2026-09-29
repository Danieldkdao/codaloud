import type { Sandbox } from "@daytona/sdk";
// Metro's server bundle breaks the SDK's ESM tslib import. The SDK publishes
// a CommonJS entry for Node, which its conditional export selects for require.
const { Daytona } = require("@daytona/sdk") as typeof import("@daytona/sdk");
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { isSyncablePath, type WorkspaceManifest } from "../lib/sync-plan";

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

const ownsSandbox = (sandbox: Sandbox, owner: SandboxOwner) =>
  sandbox.labels?.["codaloud.user"] === owner.userId &&
  sandbox.labels?.["codaloud.device"] === owner.deviceId &&
  sandbox.labels?.["codaloud.project"] === owner.projectId;

export const checkedSandbox = async (
  sandboxId: string,
  owner: SandboxOwner,
) => {
  const sandbox = await client.get(sandboxIdSchema.parse(sandboxId));
  if (!ownsSandbox(sandbox, owner))
    throw new Error("This sandbox does not belong to this project and device.");
  if (sandbox.state !== "started") await client.start(sandbox, 90);
  return sandbox;
};

export const ensureSandbox = async (
  owner: SandboxOwner,
  sandboxId: string | null,
) => {
  projectIdSchema.parse(owner.projectId);
  deviceIdSchema.parse(owner.deviceId);
  if (sandboxId) {
    try {
      const sandbox = await checkedSandbox(sandboxId, owner);
      return sandbox;
    } catch (error) {
      // A missing or destroyed copy is recreated from the phone. Ownership
      // failures must never silently redirect a device to someone else's data.
      if (error instanceof Error && error.message.includes("does not belong"))
        throw error;
    }
  }
  return client.create({
    language: "typescript",
    public: false,
    ephemeral: false,
    autoStopInterval: 30,
    autoArchiveInterval: 7 * 24 * 60,
    autoDeleteInterval: 30 * 24 * 60,
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  });
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
  if (!isSyncablePath(path)) throw new Error("Invalid workspace path.");
  return `${root}/${path}`;
};

const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

// One process walk hashes only files that can participate in the sync. The
// manifest is bounded before it reaches the phone; generated dependencies stay
// in the sandbox and are never downloaded into the local project.
const manifestScript = `const fs=require('fs'),crypto=require('crypto'),path=require('path');
const root=process.argv[1], excluded=new Set(['.git','.expo','.next','node_modules','dist','build','coverage','.venv','venv','__pycache__']);
const out={}, stack=[['',root]];let count=0;
while(stack.length){const [rel,dir]=stack.pop();for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(excluded.has(item.name))continue;
  const name=rel?rel+'/'+item.name:item.name, full=path.join(dir,item.name);
  if(item.isDirectory()){stack.push([name,full]);continue}
  if(!item.isFile())continue;
  if(++count>5000)throw Error('Too many workspace files');
  const stat=fs.statSync(full);if(stat.size>33554432)throw Error('Workspace file exceeds 32 MiB');
  out[name]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}}console.log(JSON.stringify(out));`;

const fileHashScript = `const fs=require('fs'),crypto=require('crypto');
try{const file=process.argv[1],stat=fs.lstatSync(file);
if(!stat.isFile()||stat.size>33554432)throw Error('Unsupported workspace file');
console.log(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
}catch(error){if(error.code==='ENOENT')console.log('missing');else throw error}`;

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

export const readSandboxManifest = async (
  sandbox: Sandbox,
  root: string,
): Promise<WorkspaceManifest> => {
  const command = `node -e ${shellQuote(manifestScript)} ${shellQuote(root)}`;
  const response = await sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    30,
  );
  if (response.exitCode !== 0)
    throw new Error("Unable to inspect the sandbox workspace.");
  const parsed = z
    .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
    .parse(JSON.parse(response.result));
  if (
    Object.keys(parsed).length > 5000 ||
    Object.keys(parsed).some((path) => !isSyncablePath(path))
  )
    throw new Error("The sandbox workspace contains unsupported paths.");
  return parsed;
};

export const uploadSandboxFile = async (
  sandbox: Sandbox,
  root: string,
  path: string,
  bytes: Uint8Array,
) => {
  if (bytes.byteLength > 32 * 1024 * 1024)
    throw new Error("This file exceeds the 32 MiB sync limit.");
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
  if (details.isDir || details.size > 32 * 1024 * 1024)
    throw new Error("This file cannot be downloaded to the project.");
  return sandbox.fs.downloadFile(remote, 60);
};

export const deleteSandboxFile = async (
  sandbox: Sandbox,
  root: string,
  path: string,
) => sandbox.fs.deleteFile(safeRemotePath(root, path));
