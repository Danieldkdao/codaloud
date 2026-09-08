import { and, eq, isNull, or } from "drizzle-orm";

import { db, type DbTransaction } from "@/db/db";
import {
  ProjectOperationTable,
  type ProjectOperationInsertData,
} from "@/db/schemas/project-operation";

export const insertProjectOperationDB = async (
  data: ProjectOperationInsertData,
  tx?: DbTransaction,
) => {
  const [insertedProjectOperation] = await (tx ?? db)
    .insert(ProjectOperationTable)
    .values(data)
    .returning();

  return insertedProjectOperation;
};

export const updateProjectOperationRunDb = async (
  operationId: string,
  userId: string,
  triggerRunId: string,
) => {
  const [updatedProjectOperation] = await db
    .update(ProjectOperationTable)
    .set({ triggerRunId })
    .where(
      and(
        eq(ProjectOperationTable.id, operationId),
        eq(ProjectOperationTable.userId, userId),
        or(
          isNull(ProjectOperationTable.triggerRunId),
          eq(ProjectOperationTable.triggerRunId, triggerRunId),
        ),
      ),
    )
    .returning({ id: ProjectOperationTable.id });

  return updatedProjectOperation;
};
