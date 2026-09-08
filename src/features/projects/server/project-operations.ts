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
