import { Daytona } from "@daytona/sdk";
import { z } from "zod";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";

type ExecutionFile = { path: string; content: Uint8Array };
type TemporaryExecutionInput = {
  // Explicit caller-supplied credentials; never use a shared application key.
  apiKey: string; command: string; files: readonly ExecutionFile[];
  outputPaths?: readonly string[]; timeoutSeconds?: number;
};

const validatePath = (path: string) => {
  projectFilePathSchema.parse(path);
  if (path.split("/").some((part) => part.toLowerCase() === ".git")) throw new Error("Do not upload Git metadata for execution.");
  return path;
};

// This optional server/tool integration has no database or account dependency.
// It runs only when an explicit execution caller supplies a snapshot and key.
// Returned files are proposals: callers must conflict-check before applying them.
export const executeTemporaryCode = async ({ apiKey, command, files, outputPaths = [], timeoutSeconds = 60 }: TemporaryExecutionInput) => {
  z.string().min(1).max(4096).parse(apiKey);
  z.string().min(1).max(20_000).parse(command);
  z.number().int().min(1).max(300).parse(timeoutSeconds);
  if (files.length > 5000 || outputPaths.length > 100 || files.reduce((bytes, file) => bytes + file.content.byteLength, 0) > 50 * 1024 * 1024) throw new Error("The execution snapshot exceeds its size limit.");
  const paths = files.map((file) => validatePath(file.path));
  if (new Set(paths).size !== paths.length) throw new Error("Snapshot paths must be unique.");
  outputPaths.forEach(validatePath);
  const daytona = new Daytona({ apiKey });
  const sandbox = await daytona.create({ language: "typescript", ephemeral: true, public: false, autoStopInterval: 5, autoDeleteInterval: 0 });
  try {
    const home = await sandbox.getUserHomeDir();
    if (!home) throw new Error("Missing execution directory.");
    const root = `${home}/codaloud-execution`;
    await sandbox.fs.createFolder(root, "700");
    const directories = new Set<string>();
    for (const path of paths) {
      const parts = path.split("/"); parts.pop();
      for (let count = 1; count <= parts.length; count++) directories.add(parts.slice(0, count).join("/"));
    }
    for (const path of [...directories].sort()) await sandbox.fs.createFolder(`${root}/${path}`, "700");
    await sandbox.fs.uploadFiles(files.map((file) => ({ source: Buffer.from(file.content), destination: `${root}/${file.path}` })));
    const result = await sandbox.process.executeCommand(command, root, undefined, timeoutSeconds);
    const outputs: ExecutionFile[] = [];
    let bytes = 0;
    for (const path of outputPaths) {
      const details = await sandbox.fs.getFileDetails(`${root}/${path}`);
      if (details.isDir || !Number.isSafeInteger(details.size) || details.size < 0 || bytes + details.size > 50 * 1024 * 1024) throw new Error("Execution outputs exceed the download limit.");
      const content = await sandbox.fs.downloadFile(`${root}/${path}`, 30);
      bytes += content.byteLength;
      if (bytes > 50 * 1024 * 1024) throw new Error("Execution outputs exceed the download limit.");
      outputs.push({ path, content });
    }
    return { exitCode: result.exitCode, output: result.result, files: outputs };
  } finally {
    // Propagate cleanup failure so callers cannot mistake it for a destroyed sandbox.
    await daytona.delete(sandbox);
  }
};
