import { z } from "zod";
import {
  deleteProjectFileSchema, type DeleteProjectFileSchema,
  createProjectFileSchema, projectDirectoryPathSchema, projectFileEntrySchema,
  updateProjectFileSchema, type CreateProjectFileSchema, type UpdateProjectFileSchema,
} from "@/features/projects/actions/file-schemas";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";

type SandboxFilesystemContext = { sandboxId: string; projectId: string; allowInitialize: boolean };

// Run inside Daytona, not in the Expo server. Creation and rename must reject
// collisions in the sandbox's filesystem, where concurrent writers meet.
const filesystemCommand = String.raw`
const fs = require("node:fs");
const path = require("node:path").posix;
const input = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
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
try {
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
    if (input.prepareDelete) {
      info = fs.lstatSync(target, { throwIfNoEntry: false });
      if (!info) fail("FILE_NOT_FOUND");
      if (info.isSymbolicLink()) fail("INVALID_PATH");
      if (input.kind === "folder" ? !info.isDirectory() : !info.isFile()) fail("FILE_CHANGED");
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
    process.stdout.write(JSON.stringify({ ...(input.prepareDelete ? { absolutePath: target } : {}), name: input.name, path: [input.parentPath, input.name].filter(Boolean).join("/"), isDir: info.isDirectory(), size: info.size, modifiedAt: info.mtime.toISOString() }));
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
    case "FILE_NOT_FOUND": throw new SandboxFilesError(404, "FILE_NOT_FOUND", "The selected file or folder could not be found. Please refresh and try again.");
    case "FILE_CHANGED": throw new SandboxFilesError(409, "FILE_CHANGED", "The selected item has changed. Please refresh the folder before trying again.");
    case "EEXIST": throw new SandboxFilesError(409, "NAME_CONFLICT", "Conflicting filename. Please rename this file or folder.");
    case "INVALID_PATH": throw new SandboxFilesError(400, "INVALID_PATH", "Choose a folder inside this project. Symbolic links are not supported.");
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
  toolboxUrl: string, context: SandboxFilesystemContext, parentPath: string, operation?: (CreateProjectFileSchema | UpdateProjectFileSchema) & { prepareDelete?: boolean },
) => {
  const { dir: home } = homeDirectorySchema.parse(await requestDaytona(`${toolboxUrl}/user-home-dir`));
  const payload = JSON.stringify({ home, allowInitialize: context.allowInitialize, parentPath, ...operation });
  const encoded = btoa(Array.from(new TextEncoder().encode(payload), (byte) => String.fromCharCode(byte)).join(""));
  // Only the fixed script and base64 data enter the shell. Names remain data.
  const command = `node -e '${filesystemCommand.replace(/'/g, "'\\''")}' '${encoded}'`;
  const response = executeResponseSchema.parse(await requestDaytona(`${toolboxUrl}/process/execute`, {
    method: "POST", body: JSON.stringify({ command, timeout: 10 }),
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
  // Resolve and validate the target inside the existing workspace before deleting it.
  const { absolutePath, ...deletedFile } = projectFileEntrySchema.extend({ absolutePath: z.string().startsWith("/") }).parse(
    await executeFilesystemOperation(toolboxUrl, { ...context, allowInitialize: false }, input.parentPath, { ...input, prepareDelete: true }),
  );
  const query = new URLSearchParams({ path: absolutePath, recursive: String(input.kind === "folder") });
  await requestDaytona(`${toolboxUrl}/files?${query}`, { method: "DELETE" });
  return deletedFile;
};
