import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import type { LocalDatabase } from "@/db/local/database";
import { ProjectTable, type ProjectInsertData } from "@/db/local/project";
import { projectResponseSchema, updateProjectSchema } from "../actions/schemas";
import { projectParamsSchema, readProjectCursor, type ProjectCursorSchema, type ProjectParamsSchema } from "../lib/project-params";
import type { ProjectPageData } from "../types";

export const createLocalProjectStore = (db: LocalDatabase) => ({
  read: (userId: string, projectId: string) => db.select().from(ProjectTable)
    .where(and(eq(ProjectTable.userId, userId), eq(ProjectTable.id, projectId))).get() ?? null,

  list: (userId: string, unsafeParams: Partial<ProjectParamsSchema> = {}): ProjectPageData => {
    const { search, sortBy, sortOrder, pageSize, cursor } = projectParamsSchema.parse(unsafeParams);
    const column = ProjectTable[sortBy];
    const position = cursor ? readProjectCursor(cursor) : null;
    const after = sortOrder === "asc" ? gt : lt;
    const sort = sortOrder === "asc" ? asc : desc;
    const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
    const existingProjects = db.select().from(ProjectTable).where(and(
      eq(ProjectTable.userId, userId),
      search ? sql`${ProjectTable.name} LIKE ${`%${escapedSearch}%`} ESCAPE '\\'` : undefined,
      position ? or(after(column, position.value), and(eq(column, position.value), gt(ProjectTable.id, position.id))) : undefined,
    )).orderBy(sort(column), asc(ProjectTable.id)).limit(pageSize + 1).all();
    const projects = existingProjects.slice(0, pageSize);
    const lastProject = projects.at(-1);
    return {
      projects,
      nextCursor: existingProjects.length > pageSize && lastProject ? JSON.stringify({
        version: 1, id: lastProject.id, value: lastProject[sortBy], search, sortBy, sortOrder,
      } satisfies ProjectCursorSchema) : null,
    };
  },

  insert: (unsafeProject: ProjectInsertData) => {
    const project = projectResponseSchema.parse(unsafeProject);
    const insertedProject = db.insert(ProjectTable).values(project).returning().get();
    return insertedProject;
  },

  rename: (userId: string, projectId: string, name: string) => {
    const input = updateProjectSchema.parse({ name });
    const updatedProject = db.update(ProjectTable).set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(ProjectTable.userId, userId), eq(ProjectTable.id, projectId))).returning().get();
    return updatedProject ?? null;
  },

  remove: (userId: string, projectId: string) => {
    const deletedProject = db.delete(ProjectTable)
      .where(and(eq(ProjectTable.userId, userId), eq(ProjectTable.id, projectId))).returning().get();
    return deletedProject ?? null;
  },
});
