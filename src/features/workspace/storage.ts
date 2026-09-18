import { eq } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import { getLocalDatabase } from "@/db/local/database";
import { WorkspaceTable } from "@/db/local/workspace";
import type { WorkspaceStorage } from "./types";

export const workspaceStorage: WorkspaceStorage = {
  load: async () => {
    const db = await getLocalDatabase();
    // The singleton key also makes concurrent first launches converge on one ID.
    db.insert(WorkspaceTable).values({ id: 1, ownerId: randomUUID() }).onConflictDoNothing().run();
    const existingWorkspace = db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, 1)).get();
    if (!existingWorkspace) throw new Error("Unable to open the local workspace.");
    return { ownerId: existingWorkspace.ownerId, hasEntered: existingWorkspace.hasEntered };
  },
  enter: async () => {
    const db = await getLocalDatabase();
    const updatedWorkspace = db.update(WorkspaceTable).set({ hasEntered: true })
      .where(eq(WorkspaceTable.id, 1)).returning().get();
    if (!updatedWorkspace) throw new Error("The local workspace is not ready.");
    return { ownerId: updatedWorkspace.ownerId, hasEntered: updatedWorkspace.hasEntered };
  },
};
