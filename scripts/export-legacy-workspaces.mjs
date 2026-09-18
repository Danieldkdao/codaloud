import { Daytona } from "@daytona/sdk";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

// Input comes from a read-only export of the explicitly selected Neon branch.
// Credentials are read from the environment and never included in the export.
const directory = resolve(process.argv[2] ?? "/tmp/codaloud-development-migration");
const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
if (metadata.source?.branchId !== "br-frosty-rice-a5zwwgyu") throw new Error("Expected the Neon development branch export.");
if (metadata.operations.some((operation) => !["succeeded", "failed"].includes(operation.status))) throw new Error("Finish outstanding cloud operations before exporting.");
const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, target: process.env.DAYTONA_TARGET ?? "us" });
const script = await readFile(new URL("./snapshot-legacy-workspace.py", import.meta.url), "utf8");
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const project of metadata.projects) {
  try {
    const saved = JSON.parse(await readFile(join(directory, `${project.id}.manifest.json`), "utf8"));
    const checksum = createHash("sha256").update(await readFile(join(directory, `${project.id}.tar`))).digest("hex");
    if (checksum === saved.sha256) { console.log(JSON.stringify({ projectId: project.id, verifiedExisting: true })); continue; }
  } catch { /* An incomplete export is retried without replacing source files. */ }
  if (!project.sandbox_id) throw new Error(`Missing source workspace for ${project.id}`);
  const sandbox = await daytona.get(project.sandbox_id);
  if (sandbox.labels.codaloudApp !== "codaloud" || sandbox.labels.codaloudProjectId !== project.id) throw new Error("Source ownership mismatch.");
  const startedForExport = sandbox.state !== "started";
  if (["restoring", "starting"].includes(sandbox.state)) await sandbox.waitUntilStarted(600);
  else if (startedForExport) await sandbox.start(120);
  try {
  const home = await sandbox.getUserHomeDir();
  if (!home?.startsWith("/")) throw new Error("Missing sandbox home directory.");
  const command = `python3 -c ${quote(script)} ${quote(`${home}/.codaloud/workspace`)}`;
  const result = await sandbox.process.executeCommand(command, undefined, undefined, 180);
  if (result.exitCode !== 0) throw new Error(`Snapshot failed for ${project.id}; source files were left intact.`);
  const snapshot = JSON.parse(result.result);
  const archive = join(directory, `${project.id}.tar`);
  await sandbox.fs.downloadFile(snapshot.archive, archive, 180);
  const hash = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (hash !== snapshot.sha256) throw new Error("Downloaded archive checksum mismatch.");
  await writeFile(join(directory, `${project.id}.manifest.json`), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  // Only the temporary snapshot is removed. Original worktrees and Neon rows remain.
  await sandbox.fs.deleteFile(snapshot.archive);
  console.log(JSON.stringify({ projectId: project.id, entries: snapshot.entries.length, bytes: snapshot.bytes, sha256: hash }));
  } finally { if (startedForExport) await sandbox.stop(); }
}
