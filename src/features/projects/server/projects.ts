import { db, type DbTransaction as DBTransaction } from "@/db/db";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";

export const insertProjectDB = async (
  data: ProjectInsertData,
  tx?: DBTransaction,
) => {
  const [insertedProject] = await (tx ?? db)
    .insert(ProjectTable)
    .values(data)
    .returning();

  return insertedProject;
};
