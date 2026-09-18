import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { localWorkspaceMigration, localWorkspacePreferencesMigration, localGitIdentityMigration, localImportHistoryMigration } from "../src/db/migrations.ts";

const source = resolve(process.argv[2] ?? "/tmp/codaloud-development-migration");
const destination = resolve(process.argv[3] ?? join(source, "device-data"));
const metadata = JSON.parse(readFileSync(join(source, "metadata.json"), "utf8"));
if (metadata.source?.branchId !== "br-frosty-rice-a5zwwgyu" || metadata.authors.length !== 1) throw new Error("Choose a single-owner development export.");
const manifests = metadata.projects.map((project) => JSON.parse(readFileSync(join(source, `${project.id}.manifest.json`), "utf8")));
const importId = createHash("sha256").update(JSON.stringify([metadata, manifests.map((manifest) => manifest.sha256)])).digest("hex");
mkdirSync(join(destination, "SQLite"), { recursive: true, mode: 0o700 });
mkdirSync(join(destination, "codaloud-workspaces"), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(destination, "SQLite/codaloud-workspace.db"));
const moved = [];
let staged;
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version > 4) throw new Error("Use a migration tool matching this app version.");
  if (version < 1) db.exec(localWorkspaceMigration);
  if (version < 2) db.exec(localWorkspacePreferencesMigration);
  if (version < 3) db.exec(localGitIdentityMigration);
  if (version < 4) db.exec(localImportHistoryMigration);
  db.exec("PRAGMA user_version=4");
  if (db.prepare("SELECT id FROM migration_imports WHERE id=?").get(importId)) {
    db.exec("ROLLBACK"); console.log("This verified export has already been imported.");
  } else {
    const existingWorkspace = db.prepare("SELECT * FROM workspace WHERE id=1").get();
    const ownerId = existingWorkspace?.owner_id ?? randomUUID();
    for (const project of metadata.projects) {
      if (!/^[a-f0-9-]{36}$/.test(project.id) || project.user_id !== metadata.authors[0].id) throw new Error("Invalid project ownership.");
      if (db.prepare("SELECT id FROM projects WHERE id=?").get(project.id) || existsSync(join(destination, "codaloud-workspaces", project.id))) throw new Error("Refusing to overwrite an existing local project.");
    }
    staged = join(destination, `.migration-${randomUUID()}`);
    mkdirSync(staged, { mode: 0o700 });
    for (const [index, project] of metadata.projects.entries()) {
      const workspace = join(staged, project.id);
      execFileSync("python3", ["scripts/extract-legacy-workspace.py", join(source, `${project.id}.tar`), join(source, `${project.id}.manifest.json`), workspace], { stdio: "pipe" });
      const git = (...args) => execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
      if (!existsSync(join(workspace, ".git"))) git("init", "--quiet", "--initial-branch=main");
      else {
        if (git("status", "--porcelain=v1", "-z", "--untracked-files=all") !== manifests[index].status) throw new Error("Git worktree/index state changed during migration.");
        const refs = spawnSync("git", ["-C", workspace, "show-ref"], { encoding: "utf8" });
        if (![0, 1].includes(refs.status) || refs.stdout !== manifests[index].refs) throw new Error("Git references changed during migration.");
        git("fsck", "--full", "--no-reflogs");
      }
    }
    db.prepare("INSERT INTO workspace(id,owner_id,has_entered,git_author_name,git_author_email) VALUES(1,?,0,?,?) ON CONFLICT(id) DO NOTHING")
      .run(ownerId, metadata.authors[0].name, metadata.authors[0].email);
    const insert = db.prepare("INSERT INTO projects(id,user_id,name,search_name,sandbox_id,setup_status,setup_error,github_repository_id,last_opened_file_path,last_opened_at,created_at,updated_at) VALUES(?,?,?,?,?,'ready',NULL,?,?,?,?,?)");
    for (const project of metadata.projects) {
      const target = join(destination, "codaloud-workspaces", project.id);
      renameSync(join(staged, project.id), target); moved.push(target);
      insert.run(project.id, ownerId, project.name, project.name.toLowerCase(), project.sandbox_id, project.github_repository_id,
        project.last_opened_file_path, project.last_opened_at ? new Date(project.last_opened_at).toISOString() : null,
        new Date(project.created_at).toISOString(), new Date(project.updated_at).toISOString());
    }
    db.prepare("INSERT INTO migration_imports(id,source_branch_id,imported_at,metadata) VALUES(?,?,?,?)")
      .run(importId, metadata.source.branchId, new Date().toISOString(), JSON.stringify(metadata));
    db.exec("COMMIT"); moved.length = 0;
    console.log(JSON.stringify({ importedProjects: metadata.projects.length, preservedOperations: metadata.operations.length, importId, destination }));
  }
} catch (error) {
  try { db.exec("ROLLBACK"); } catch { /* Transaction may not have started. */ }
  for (const path of moved) rmSync(path, { recursive: true });
  throw error;
} finally {
  db.close();
  if (staged) rmSync(staged, { recursive: true, force: true });
}
