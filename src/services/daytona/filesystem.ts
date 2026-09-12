import { z } from "zod";
import {
  deleteProjectFileSchema, type DeleteProjectFileSchema,
  saveProjectFileContentSchema, savedProjectFileContentSchema, type SaveProjectFileContentSchema,
  createProjectFileSchema, projectDirectoryPathSchema, projectFileEntrySchema, projectFilePathSchema, projectFileContentSchema,
  updateProjectFileSchema, type CreateProjectFileSchema, type UpdateProjectFileSchema,
} from "@/features/projects/actions/file-schemas";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand, sandboxCommandInput } from "./create-command";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";

type SandboxFilesystemContext = { sandboxId: string; projectId: string; allowInitialize: boolean };

// Run inside Daytona, not in the Expo server. Creation and rename must reject
// collisions in the sandbox's filesystem, where concurrent writers meet.
const filesystemCommand = String.raw`
const fs = require("node:fs");
const path = require("node:path").posix;
${sandboxCommandInput}
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const validateName = (name) => {
  if (!name || name === "." || name === ".." || /[\/\\\x00-\x1f\x7f]/.test(name)) fail("INVALID_PATH");
};
const directory = (target, initialize) => {
  if (initialize) {
    try { fs.mkdirSync(target, { mode: 0o755 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  let info;
  try { info = fs.lstatSync(target); }
  catch (error) { if (error.code === "ENOENT" && !initialize) fail("WORKSPACE_NOT_READY"); throw error; }
  if (info.isSymbolicLink()) fail("INVALID_PATH");
  if (!info.isDirectory()) fail("ENOTDIR");
  return target;
};
const readContent = (target) => {
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!existing) fail("FILE_NOT_FOUND");
  if (existing.isSymbolicLink()) fail("INVALID_PATH");
  if (!existing.isFile()) fail("NOT_A_FILE");
  // Reject special files without blocking, including replacements after lstat.
  const fd = fs.openSync(target, (input.saveContent ? fs.constants.O_RDWR : fs.constants.O_RDONLY) | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile()) fail("NOT_A_FILE");
    if (info.dev !== existing.dev || info.ino !== existing.ino) fail("INVALID_PATH");
    if (info.size > input.maxBytes) fail("FILE_TOO_LARGE");
    // One extra byte detects growth past the limit without reading the whole file.
    const bytes = Buffer.alloc(input.maxBytes + 1);
    let size = 0;
    while (size <= input.maxBytes) {
      const count = fs.readSync(fd, bytes, size, Math.min(65536, bytes.length - size), null);
      if (count === 0) break;
      size += count;
      if (size > input.maxBytes) fail("FILE_TOO_LARGE");
    }
    const after = fs.fstatSync(fd);
    if (after.size > input.maxBytes) fail("FILE_TOO_LARGE");
    if (after.size !== size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) fail("FILE_CHANGED");
    const data = bytes.subarray(0, size);
    if (data.includes(0)) fail("UNSUPPORTED_FILE_ENCODING");
    let content;
    try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
    catch { fail("UNSUPPORTED_FILE_ENCODING"); }
    return { path: [input.parentPath, input.name].filter(Boolean).join("/"), content, size, ...(input.saveContent ? { info: after } : {}) };
  } finally {
    fs.closeSync(fd);
  }
};
const saveContent = (parentFd, target) => {
  // Lock the anchored directory, not the file inode that atomic rename replaces.
  // The child inherits the same open description; closing parentFd releases it.
  try {
    require("node:child_process").execFileSync("flock", ["-x", "-w", "5", "3"], {
      stdio: ["ignore", "pipe", "pipe", parentFd], timeout: 6000,
    });
  } catch (error) { fail(error.status === 1 ? "SAVE_BUSY" : "FILESYSTEM_UNAVAILABLE"); }
  const current = readContent(target);
  const hash = (content) => require("node:crypto").createHash("sha256").update(content).digest("hex");
  if (hash(current.content) !== input.expectedContentHash) fail("FILE_CHANGED");
  const bytes = Buffer.from(input.content, "utf8");
  if (bytes.length > input.maxBytes) fail("FILE_TOO_LARGE");
  if (bytes.includes(0) || bytes.toString("utf8") !== input.content) fail("UNSUPPORTED_FILE_ENCODING");
  const temporary = "/proc/self/fd/" + parentFd + "/.codaloud-save-" + require("node:crypto").randomUUID();
  let fd;
  let committed = false;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fchmodSync(fd, current.info.mode & 0o777);
    fs.fsyncSync(fd);
    const latest = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!latest || latest.isSymbolicLink() || latest.dev !== current.info.dev || latest.ino !== current.info.ino
      || latest.size !== current.info.size || latest.mtimeMs !== current.info.mtimeMs || latest.ctimeMs !== current.info.ctimeMs) fail("FILE_CHANGED");
    // The original is untouched until the complete replacement is ready.
    fs.renameSync(temporary, target);
    committed = true;
    fs.fsyncSync(parentFd);
    return { path: current.path, size: bytes.length, contentHash: hash(bytes) };
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
      if (!committed) fs.unlinkSync(temporary);
    }
  }
};
const accessWorkspaceContent = () => {
  // Node has no openat API. Linux procfs lets us resolve each single component
  // relative to an open directory, even if another process renames that directory.
  // Never fall back to absolute pathname checks: an attacker can swap and restore
  // a parent between those checks while the opened file remains outside the workspace.
  if (process.platform !== "linux") fail("FILESYSTEM_UNAVAILABLE");
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
  let parentFd = fs.openSync("/", flags);
  try {
    // Anchor the home path too; opening the workspace's full path would still
    // follow symlinks in .codaloud, workspace, or any earlier component.
    const parts = [...input.home.split("/").filter(Boolean), ".codaloud", "workspace", ...input.parentPath.split("/").filter(Boolean)];
    for (const part of parts) {
      validateName(part);
      let childFd;
      try { childFd = fs.openSync("/proc/self/fd/" + parentFd + "/" + part, flags); }
      catch (error) {
        if (error.code === "ELOOP" || error.code === "ENOTDIR") fail("INVALID_PATH");
        if (error.code === "ENOENT") fail("WORKSPACE_NOT_READY");
        throw error;
      }
      // Keep at most two directory descriptors live, regardless of path depth.
      const previousFd = parentFd;
      parentFd = childFd;
      fs.closeSync(previousFd);
    }
    validateName(input.name);
    const target = "/proc/self/fd/" + parentFd + "/" + input.name;
    return input.saveContent ? saveContent(parentFd, target) : readContent(target);
  } finally {
    fs.closeSync(parentFd);
  }
};
try {
  if (input.readContent || input.saveContent) {
    process.stdout.write(JSON.stringify(accessWorkspaceContent()));
  } else {
    const home = fs.realpathSync(input.home);
    const base = directory(path.join(home, ".codaloud"), input.allowInitialize);
    const root = directory(path.join(base, "workspace"), input.allowInitialize);
    let parent = root;
    for (const part of input.parentPath.split("/").filter(Boolean)) {
      if (part === "." || part === ".." || part.includes("\\") || part.includes("\0")) fail("INVALID_PATH");
      parent = directory(path.join(parent, part), false);
    }
    if (input.name === undefined) {
      process.stdout.write(JSON.stringify({ path: parent }));
    } else {
      validateName(input.name);
      const target = path.join(parent, input.name);
      let info;
      if (input.delete) {
        info = fs.lstatSync(target, { throwIfNoEntry: false });
        if (!info) fail("FILE_NOT_FOUND");
        if (info.isSymbolicLink()) fail("INVALID_PATH");
        if (input.kind === "folder" ? !info.isDirectory() : !info.isFile()) fail("FILE_CHANGED");
        // Keep validation and deletion in this command: returning a pathname for
        // a later HTTP DELETE lets another writer replace it during the round trip.
        fs.rmSync(target, { recursive: input.kind === "folder" });
      } else if (input.previousName !== undefined) {
        validateName(input.previousName);
        const source = path.join(parent, input.previousName);
        const existing = fs.lstatSync(source, { throwIfNoEntry: false });
        if (!existing) fail("FILE_NOT_FOUND");
        if (existing.isSymbolicLink()) fail("INVALID_PATH");
        if (input.kind === "folder" ? !existing.isDirectory() : !existing.isFile()) fail("FILE_CHANGED");
        if (source !== target) {
          if (fs.lstatSync(target, { throwIfNoEntry: false })) fail("EEXIST");
          // GNU mv in Daytona uses an exclusive rename. -T prevents nesting a folder
          // into a destination created concurrently; -n prevents overwriting it.
          require("node:child_process").execFileSync("mv", ["-n", "-T", "--", source, target], { timeout: 5000, stdio: "pipe" });
          const updated = fs.lstatSync(target, { throwIfNoEntry: false });
          // mv -n can exit successfully after skipping a collision.
          if (!updated || updated.dev !== existing.dev || updated.ino !== existing.ino) fail("EEXIST");
        }
      } else if (input.kind === "folder") fs.mkdirSync(target, { mode: 0o755 });
      else fs.closeSync(fs.openSync(target, "wx", 0o644));
      info ??= fs.lstatSync(target);
      process.stdout.write(JSON.stringify({ name: input.name, path: [input.parentPath, input.name].filter(Boolean).join("/"), isDir: info.isDirectory(), size: info.size, modifiedAt: info.mtime.toISOString() }));
    }
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ code: error.code || "FILESYSTEM_ERROR" }));
  process.exitCode = 1;
}
`;

const executeResponseSchema = z.object({ exitCode: z.number(), result: z.string() });
export type ExecuteResponseSchema = z.infer<typeof executeResponseSchema>;
const homeDirectorySchema = z.object({ dir: z.string().startsWith("/").min(2) });
export type HomeDirectorySchema = z.infer<typeof homeDirectorySchema>;

const throwFilesystemError = (code: unknown): never => {
  switch (code) {
    case "FILESYSTEM_UNAVAILABLE": throw new SandboxFilesError(502, "FILESYSTEM_UNAVAILABLE", "Secure file access is unavailable in this workspace. Please try again later.");
    case "FILE_NOT_FOUND": throw new SandboxFilesError(404, "FILE_NOT_FOUND", "The selected file or folder could not be found. Please refresh and try again.");
    case "FILE_CHANGED": throw new SandboxFilesError(409, "FILE_CHANGED", "The selected item has changed. Reload it before trying again.");
    case "SAVE_BUSY": throw new SandboxFilesError(409, "SAVE_BUSY", "Another save is in progress. Please try again.");
    case "FILE_TOO_LARGE": throw new SandboxFilesError(413, "FILE_TOO_LARGE", `This file is too large for the editor. The limit is ${MAX_PROJECT_FILE_SIZE_BYTES} bytes.`);
    case "NOT_A_FILE": throw new SandboxFilesError(415, "NOT_A_FILE", "Choose a regular text file to open in the editor.");
    case "UNSUPPORTED_FILE_ENCODING": throw new SandboxFilesError(415, "UNSUPPORTED_FILE_ENCODING", "This file is binary or is not valid UTF-8 text.");
    case "EEXIST": throw new SandboxFilesError(409, "NAME_CONFLICT", "Conflicting filename. Please rename this file or folder.");
    case "ELOOP":
    case "INVALID_PATH": throw new SandboxFilesError(400, "INVALID_PATH", "Choose a path inside this project. Symbolic links are not supported.");
    case "WORKSPACE_NOT_READY": throw new SandboxFilesError(409, "WORKSPACE_NOT_READY", "This folder is unavailable or the project workspace has not been prepared.");
    case "ENOENT":
    case "ENOTDIR": throw new SandboxFilesError(404, "FOLDER_NOT_FOUND", "The selected folder could not be found. Please refresh and try again.");
    case "EACCES":
    case "EPERM": throw new SandboxFilesError(403, "FILESYSTEM_PERMISSION_DENIED", "This workspace does not allow that file operation.");
    case "ENOSPC": throw new SandboxFilesError(409, "WORKSPACE_FULL", "Your workspace is out of disk space.");
    default: throw new SandboxFilesError(502, "FILESYSTEM_ERROR", "The file operation could not be completed. Please refresh and try again.");
  }
};

const executeFilesystemOperation = async (
  toolboxUrl: string, context: SandboxFilesystemContext, parentPath: string, operation?: (CreateProjectFileSchema | UpdateProjectFileSchema) & { delete?: boolean; readContent?: boolean; saveContent?: boolean; content?: string; expectedContentHash?: string; maxBytes?: number },
) => {
  const { dir: home } = homeDirectorySchema.parse(await requestDaytona(`${toolboxUrl}/user-home-dir`));
  const payload = { home, allowInitialize: context.allowInitialize, parentPath, ...operation };
  const response = executeResponseSchema.parse(await requestDaytona(`${toolboxUrl}/process/execute`, {
    method: "POST", body: JSON.stringify(createSandboxCommand(filesystemCommand, payload, 10)),
  }));
  const result: unknown = JSON.parse(response.result);
  if (response.exitCode !== 0) throwFilesystemError(z.object({ code: z.string() }).parse(result).code);
  return result;
};

export const readSandboxFiles = async (context: SandboxFilesystemContext, unsafePath: string) => {
  const path = projectDirectoryPathSchema.parse(unsafePath);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  const directory = z.object({ path: z.string() }).parse(await executeFilesystemOperation(toolboxUrl, context, path));
  const query = new URLSearchParams({ path: directory.path, depth: "1" });
  const entries = z.array(projectFileEntrySchema.omit({ path: true })).parse(await requestDaytona(`${toolboxUrl}/files?${query}`));
  return entries.map((entry) => ({ ...entry, path: [path, entry.name].filter(Boolean).join("/") }));
};

export const readSandboxFileContent = async (context: SandboxFilesystemContext, unsafePath: string) => {
  const path = projectFilePathSchema.parse(unsafePath);
  const separator = path.lastIndexOf("/");
  const parentPath = separator === -1 ? "" : path.slice(0, separator);
  const name = path.slice(separator + 1);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  // Keep validation, metadata checks, and bounded reading in one sandbox operation.
  // The Expo server uses HTTP only; Node filesystem APIs execute inside Daytona.
  const content = projectFileContentSchema.parse(await executeFilesystemOperation(
    toolboxUrl, { ...context, allowInitialize: false }, parentPath,
    { parentPath, name, kind: "file", readContent: true, maxBytes: MAX_PROJECT_FILE_SIZE_BYTES },
  ));
  if (content.path !== path) throw new SandboxFilesError(502, "FILESYSTEM_ERROR", "Unable to confirm the requested file contents.");
  return content;
};

export const createSandboxFile = async (context: SandboxFilesystemContext, unsafeInput: CreateProjectFileSchema) => {
  const input = createProjectFileSchema.parse(unsafeInput);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  return projectFileEntrySchema.parse(await executeFilesystemOperation(toolboxUrl, context, input.parentPath, input));
};

export const updateSandboxFile = async (context: SandboxFilesystemContext, unsafeInput: UpdateProjectFileSchema) => {
  const input = updateProjectFileSchema.parse(unsafeInput);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  // Renaming never needs to create a missing workspace or parent directory.
  return projectFileEntrySchema.parse(await executeFilesystemOperation(toolboxUrl, { ...context, allowInitialize: false }, input.parentPath, input));
};

export const deleteSandboxFile = async (context: SandboxFilesystemContext, unsafeInput: DeleteProjectFileSchema) => {
  const input = deleteProjectFileSchema.parse(unsafeInput);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  return projectFileEntrySchema.parse(
    await executeFilesystemOperation(toolboxUrl, { ...context, allowInitialize: false }, input.parentPath, { ...input, delete: true }),
  );
};

export const saveSandboxFileContent = async (context: SandboxFilesystemContext, unsafeInput: SaveProjectFileContentSchema) => {
  const input = saveProjectFileContentSchema.parse(unsafeInput);
  const separator = input.path.lastIndexOf("/");
  const parentPath = separator === -1 ? "" : input.path.slice(0, separator);
  const name = input.path.slice(separator + 1);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  const savedFile = savedProjectFileContentSchema.parse(await executeFilesystemOperation(
    toolboxUrl, { ...context, allowInitialize: false }, parentPath,
    { parentPath, name, kind: "file", saveContent: true, content: input.content, expectedContentHash: input.expectedContentHash, maxBytes: MAX_PROJECT_FILE_SIZE_BYTES },
  ));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.content));
  const contentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (savedFile.path !== input.path || savedFile.size !== new TextEncoder().encode(input.content).byteLength || savedFile.contentHash !== contentHash) {
    throw new SandboxFilesError(502, "FILESYSTEM_ERROR", "Unable to confirm the saved file contents.");
  }
  return savedFile;
};
