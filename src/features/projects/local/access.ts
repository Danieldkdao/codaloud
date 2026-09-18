import { db } from "@/db/db";
import { ProjectTable } from "@/db/schemas/project";
import { migrateDatabase } from "@/db/migrate";
import { executeWorkspace, LocalWorkspaceError } from "@/services/local-workspace/execute";
import { createLocalProjectStore } from "./projects";

let recovery: Promise<void> | undefined;
export const getLocalProjects = async () => {
  await migrateDatabase();
  // Recover once at startup, before any action can start a new deletion. A row
  // still present in SQLite means the deletion never committed.
  recovery ??= (async () => {
    const existingProjects = db.select({ id: ProjectTable.id }).from(ProjectTable).all();
    for (const project of existingProjects) await executeWorkspace(project.id, "restore-project");
  })().catch((error: unknown) => { recovery = undefined; throw error; });
  await recovery;
  return createLocalProjectStore(db);
};

export const requireLocalProject = async (projectId: string) => {
  const store = await getLocalProjects();
  const existingProject = store.read(projectId.toLowerCase());
  if (!existingProject) throw new LocalWorkspaceError("PROJECT_NOT_FOUND", "This project is not on this device.");
  return existingProject;
};
