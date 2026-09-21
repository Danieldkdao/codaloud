import { db } from "@/db/local/db";
import { migrateDatabase } from "@/db/local/migrate";
import { ProjectTable } from "@/db/local/schemas/project";
import {
  executeWorkspace,
  listArchivedWorkspaceIds,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { localProjectStore } from "./projects";

let recovery: Promise<void> | undefined;
export const getLocalProjects = async () => {
  await migrateDatabase();
  // Recover once at startup, before any action can start a new deletion. A row
  // still present in SQLite means the deletion never committed.
  recovery ??= (async () => {
    const existingProjects = db
      .select({ id: ProjectTable.id })
      .from(ProjectTable)
      .all();
    for (const project of existingProjects)
      await executeWorkspace(project.id, "restore-project");
    const existingIds = new Set(existingProjects.map((project) => project.id));
    for (const id of await listArchivedWorkspaceIds()) {
      if (existingIds.has(id)) continue;
      // A committed deletion has no SQLite row. The archive is its durable
      // cleanup marker; a failed purge leaves it discoverable on next startup.
      await executeWorkspace(id, "purge-project").catch(() => undefined);
    }
  })().catch((error: unknown) => {
    recovery = undefined;
    throw error;
  });
  await recovery;
  return localProjectStore;
};

export const requireLocalProject = async (projectId: string) => {
  const store = await getLocalProjects();
  const existingProject = store.read(projectId.toLowerCase());
  if (!existingProject)
    throw new LocalWorkspaceError(
      "PROJECT_NOT_FOUND",
      "This project is not on this device.",
    );
  return existingProject;
};
