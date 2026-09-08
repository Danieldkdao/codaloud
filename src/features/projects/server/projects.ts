import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  ilike,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";

import { db, type DbTransaction as DBTransaction } from "@/db/db";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";
import { ProjectOperationTable } from "@/db/schemas/project-operation";
import type { UpdateProjectSchema } from "@/features/projects/actions/schemas";
import {
  projectParamsSchema,
  readProjectCursor,
  type ProjectCursorSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";

const projectDeletionRequested = () =>
  sql<boolean>`${exists(
    db
      .select({ id: ProjectOperationTable.id })
      .from(ProjectOperationTable)
      .where(
        and(
          eq(ProjectOperationTable.projectId, ProjectTable.id),
          eq(ProjectOperationTable.userId, ProjectTable.userId),
          eq(ProjectOperationTable.kind, "delete"),
        ),
      ),
  )}`;

export const readUserProjectsDb = async (
  userId: string,
  params: Partial<ProjectParamsSchema> = {},
) => {
  const { search, sortBy, sortOrder, cursor, pageSize } =
    projectParamsSchema.parse(params);
  const sort = sortOrder === "asc" ? asc : desc;
  const after = sortOrder === "asc" ? gt : lt;
  const column = ProjectTable[sortBy];
  const position = cursor ? readProjectCursor(cursor) : null;
  // Keep PostgreSQL's microseconds; passing a JavaScript Date loses precision.
  const boundary = position
    ? sortBy === "name"
      ? sql`${position.value}`
      : sql`${position.value}::timestamptz`
    : undefined;
  // Treat LIKE wildcards as literal characters in project-name searches.
  const escapedSearch = search.replace(/[\\%_]/g, "\\$&");

  const userProjects = await db
    .select({
      ...getTableColumns(ProjectTable),
      deletionRequested: projectDeletionRequested(),
      cursorValue:
        sortBy === "name"
          ? ProjectTable.name
          : sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(ProjectTable)
    .where(
      and(
        eq(ProjectTable.userId, userId),
        search ? ilike(ProjectTable.name, `%${escapedSearch}%`) : undefined,
        position && boundary
          ? or(
              after(column, boundary),
              and(eq(column, boundary), gt(ProjectTable.id, position.id)),
            )
          : undefined,
      ),
    )
    // The unique tie-breaker keeps equal names or timestamps in a stable order.
    .orderBy(sort(column), asc(ProjectTable.id))
    .limit(pageSize + 1);

  const pageProjects = userProjects.slice(0, pageSize);
  const lastProject = pageProjects.at(-1);
  const nextCursor =
    userProjects.length > pageSize && lastProject
      ? JSON.stringify({
          version: 1,
          id: lastProject.id,
          value: lastProject.cursorValue,
          search,
          sortBy,
          sortOrder,
        } satisfies ProjectCursorSchema)
      : null;

  // The cursor is a position, not authorization: every page is scoped to userId.
  return {
    projects: pageProjects.map(
      ({ cursorValue: _cursorValue, ...project }) => project,
    ),
    nextCursor,
  };
};

export const insertProjectDb = async (
  data: ProjectInsertData,
  tx?: DBTransaction,
) => {
  const [insertedProject] = await (tx ?? db)
    .insert(ProjectTable)
    .values(data)
    .returning();

  return insertedProject;
};

export const confirmUserProjectOwnership = async (
  userId: string,
  projectId: string,
) => {
  const [existingProject] = await db
    .select({
      ...getTableColumns(ProjectTable),
      deletionRequested: projectDeletionRequested(),
    })
    .from(ProjectTable)
    .where(and(eq(ProjectTable.userId, userId), eq(ProjectTable.id, projectId)))
    .limit(1);

  return existingProject ?? null;
};

export const updateUserProjectDb = async (
  userId: string,
  projectId: string,
  data: UpdateProjectSchema,
) => {
  const [updatedProject] = await db
    .update(ProjectTable)
    .set(data)
    .where(
      and(
        eq(ProjectTable.id, projectId),
        eq(ProjectTable.userId, userId),
        not(projectDeletionRequested()),
      ),
    )
    .returning();

  return updatedProject;
};

export const updateUserProjectSandboxDb = async (
  userId: string,
  projectId: string,
  sandboxId: string,
) => {
  const [updatedProject] = await db
    .update(ProjectTable)
    .set({ sandboxId })
    .where(
      and(
        eq(ProjectTable.id, projectId),
        eq(ProjectTable.userId, userId),
        or(
          isNull(ProjectTable.sandboxId),
          eq(ProjectTable.sandboxId, sandboxId),
        ),
      ),
    )
    .returning();

  return updatedProject;
};
