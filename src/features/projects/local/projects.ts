import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db/db";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";
import {
  projectResponseSchema,
  updateProjectSchema,
  type UpdateProjectSchema,
} from "../actions/schemas";
import {
  projectParamsSchema,
  readProjectCursor,
  type ProjectCursorSchema,
  type ProjectParamsSchema,
} from "../lib/project-params";
import type { ProjectPageData } from "../types";

const { searchName: _searchName, ...projectColumns } =
  getTableColumns(ProjectTable);

export const localProjectStore = {
  read: (projectId: string) =>
    db
      .select(projectColumns)
      .from(ProjectTable)
      .where(eq(ProjectTable.id, projectId))
      .get() ?? null,

  list: (unsafeParams: Partial<ProjectParamsSchema> = {}): ProjectPageData => {
    const { search, sortBy, sortOrder, pageSize, cursor } =
      projectParamsSchema.parse(unsafeParams);
    const column = ProjectTable[sortBy];
    const position = cursor ? readProjectCursor(cursor) : null;
    const after = sortOrder === "asc" ? gt : lt;
    const sort = sortOrder === "asc" ? asc : desc;
    const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
    const existingProjects = db
      .select(projectColumns)
      .from(ProjectTable)
      .where(
        and(
          search
            ? sql`${ProjectTable.searchName} LIKE ${`%${escapedSearch.toLowerCase()}%`} ESCAPE '\\'`
            : undefined,
          position
            ? or(
                after(column, position.value),
                and(
                  eq(column, position.value),
                  gt(ProjectTable.id, position.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(sort(column), asc(ProjectTable.id))
      .limit(pageSize + 1)
      .all();
    const projects = existingProjects.slice(0, pageSize);
    const lastProject = projects.at(-1);
    return {
      projects,
      nextCursor:
        existingProjects.length > pageSize && lastProject
          ? JSON.stringify({
              version: 1,
              id: lastProject.id,
              value: lastProject[sortBy],
              search,
              sortBy,
              sortOrder,
            } satisfies ProjectCursorSchema)
          : null,
    };
  },

  insert: (unsafeProject: Omit<ProjectInsertData, "searchName">) => {
    const project = projectResponseSchema.parse(unsafeProject);
    // SQLite's built-in case folding covers ASCII only. Normalize both sides
    // with JavaScript so non-ASCII project names remain searchable offline.
    const insertedProject = db
      .insert(ProjectTable)
      .values({ ...project, searchName: project.name.toLowerCase() })
      .returning(projectColumns)
      .get();
    return insertedProject;
  },

  update: (projectId: string, unsafeInput: UpdateProjectSchema) => {
    const input = updateProjectSchema.parse(unsafeInput);
    const updatedProject = db
      .update(ProjectTable)
      .set({
        ...input,
        ...(input.name !== undefined
          ? { searchName: input.name.toLowerCase() }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ProjectTable.id, projectId))
      .returning(projectColumns)
      .get();
    return updatedProject ?? null;
  },

  remove: (projectId: string) => {
    const deletedProject = db
      .delete(ProjectTable)
      .where(eq(ProjectTable.id, projectId))
      .returning(projectColumns)
      .get();
    return deletedProject ?? null;
  },

  connectGitHub: (projectId: string, repositoryId: string) => {
    const updatedProject = db
      .update(ProjectTable)
      .set({
        githubRepositoryId: repositoryId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ProjectTable.id, projectId))
      .returning(projectColumns)
      .get();
    return updatedProject ?? null;
  },
};
