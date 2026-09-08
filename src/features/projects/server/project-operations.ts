import { and, asc, eq, exists, isNull, lte, or, sql } from "drizzle-orm";

import { db, type DbTransaction } from "@/db/db";
import { ProjectTable } from "@/db/schemas/project";
import {
  projectSandboxDispatchInitialDelaySeconds,
  projectSandboxDispatchMaxDelaySeconds,
} from "@/features/projects/constants";
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
  dispatchAttempts: number,
) => {
  const [updatedProjectOperation] = await db
    .update(ProjectOperationTable)
    .set({ triggerRunId, errorCode: null, errorMessage: null })
    .where(
      and(
        eq(ProjectOperationTable.id, operationId),
        eq(ProjectOperationTable.userId, userId),
        eq(ProjectOperationTable.status, "queued"),
        eq(ProjectOperationTable.dispatchAttempts, dispatchAttempts),
        or(
          isNull(ProjectOperationTable.triggerRunId),
          eq(ProjectOperationTable.triggerRunId, triggerRunId),
        ),
      ),
    )
    .returning({ id: ProjectOperationTable.id });

  return updatedProjectOperation;
};

const pendingSandboxDispatch = () =>
  and(
    eq(ProjectOperationTable.kind, "prepare"),
    eq(ProjectOperationTable.status, "queued"),
    isNull(ProjectOperationTable.triggerRunId),
    lte(ProjectOperationTable.nextDispatchAt, sql`now()`),
    exists(
      db.select({ id: ProjectTable.id }).from(ProjectTable).where(
        and(
          eq(ProjectTable.id, ProjectOperationTable.projectId),
          eq(ProjectTable.userId, ProjectOperationTable.userId),
        ),
      ),
    ),
  );

export const readDueProjectSandboxOperationsDb = async (limit: number) => {
  const pendingProjectOperations = await db
    .select({ id: ProjectOperationTable.id, userId: ProjectOperationTable.userId })
    .from(ProjectOperationTable)
    .where(pendingSandboxDispatch())
    .orderBy(asc(ProjectOperationTable.nextDispatchAt), asc(ProjectOperationTable.id))
    .limit(limit);

  return pendingProjectOperations;
};

export const claimProjectSandboxDispatchDb = async (operationId: string, userId: string) => {
  // Reserve the next retry before network I/O. A process crash cannot strand a claim,
  // and PostgreSQL rechecks the predicate if another dispatcher updated this row.
  const [updatedProjectOperation] = await db
    .update(ProjectOperationTable)
    .set({
      dispatchAttempts: sql`${ProjectOperationTable.dispatchAttempts} + 1`,
      nextDispatchAt: sql`now() + least(
        ${projectSandboxDispatchMaxDelaySeconds},
        ${projectSandboxDispatchInitialDelaySeconds} * power(2, least(${ProjectOperationTable.dispatchAttempts}, 3))
      ) * interval '1 second'`,
    })
    .where(and(
      eq(ProjectOperationTable.id, operationId),
      eq(ProjectOperationTable.userId, userId),
      pendingSandboxDispatch(),
    ))
    .returning();

  return updatedProjectOperation;
};

export const recordProjectSandboxDispatchFailureDb = async (
  operationId: string,
  userId: string,
  dispatchAttempts: number,
) => {
  const [updatedProjectOperation] = await db
    .update(ProjectOperationTable)
    .set({
      errorCode: "SANDBOX_DISPATCH_UNCONFIRMED",
      errorMessage: "Workspace setup could not be submitted. It will be retried automatically.",
    })
    .where(and(
      eq(ProjectOperationTable.id, operationId),
      eq(ProjectOperationTable.userId, userId),
      eq(ProjectOperationTable.status, "queued"),
      isNull(ProjectOperationTable.triggerRunId),
      // A late response from an expired claim cannot overwrite a newer attempt.
      eq(ProjectOperationTable.dispatchAttempts, dispatchAttempts),
    ))
    .returning({ id: ProjectOperationTable.id });

  return updatedProjectOperation;
};
