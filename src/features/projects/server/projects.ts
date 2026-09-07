import { and, asc, desc, eq, ilike } from "drizzle-orm";

import { db, type DbTransaction as DBTransaction } from "@/db/db";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";

export const readUserProjectsDb = async (
  userId: string,
  params: Partial<ProjectParamsSchema> = {},
) => {
  const { search, sortBy, sortOrder, page, pageSize } =
    projectParamsSchema.parse(params);
  const sort = sortOrder === "asc" ? asc : desc;
  // Treat LIKE wildcards as literal characters in project-name searches.
  const escapedSearch = search.replace(/[\\%_]/g, "\\$&");

  const userProjects = await db
    .select()
    .from(ProjectTable)
    .where(
      and(
        eq(ProjectTable.userId, userId),
        search ? ilike(ProjectTable.name, `%${escapedSearch}%`) : undefined,
      ),
    )
    // The unique tie-breaker keeps equal names or timestamps in a stable order.
    .orderBy(sort(ProjectTable[sortBy]), asc(ProjectTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return userProjects;
};

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
