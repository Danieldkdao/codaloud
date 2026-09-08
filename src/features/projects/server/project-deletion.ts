import { and, asc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { ProjectTable } from "@/db/schemas/project";
import { ProjectOperationTable } from "@/db/schemas/project-operation";
import type { ProjectSandboxLifecycleContext } from "@/features/projects/types";

export const requestProjectDeletionDb = async (
  userId: string,
  projectId: string,
) =>
  db.transaction(async (tx) => {
    const [existingProject] = await tx
      .select()
      .from(ProjectTable)
      .where(
        and(eq(ProjectTable.id, projectId), eq(ProjectTable.userId, userId)),
      )
      .for("update");
    if (!existingProject) return null;

    const [existingProjectOperation] = await tx
      .select()
      .from(ProjectOperationTable)
      .where(
        and(
          eq(ProjectOperationTable.projectId, projectId),
          eq(ProjectOperationTable.userId, userId),
          eq(ProjectOperationTable.kind, "delete"),
        ),
      )
      .limit(1);
    if (existingProjectOperation)
      return { project: existingProject, operation: existingProjectOperation };

    const [insertedProjectOperation] = await tx
      .insert(ProjectOperationTable)
      .values({
        projectId,
        userId,
        kind: "delete",
      })
      .returning();
    return { project: existingProject, operation: insertedProjectOperation };
  });

export const readProjectDeletionOperationDb = async (
  context: ProjectSandboxLifecycleContext,
) => {
  if (!context.operationId) return null;
  const [existingProjectOperation] = await db
    .select()
    .from(ProjectOperationTable)
    .where(
      and(
        eq(ProjectOperationTable.id, context.operationId),
        eq(ProjectOperationTable.projectId, context.projectId),
        eq(ProjectOperationTable.userId, context.userId),
        eq(ProjectOperationTable.kind, "delete"),
      ),
    );
  return existingProjectOperation ?? null;
};

export const beginProjectDeletionDb = async (
  context: ProjectSandboxLifecycleContext,
) =>
  db.transaction(async (tx) => {
    const [existingProject] = await tx
      .select()
      .from(ProjectTable)
      .where(
        and(
          eq(ProjectTable.id, context.projectId),
          eq(ProjectTable.userId, context.userId),
        ),
      )
      .for("update");
    const [updatedProjectOperation] = await tx
      .update(ProjectOperationTable)
      .set({
        status: "running",
        phase: "deleting-sandbox",
        triggerRunId: context.runId,
        errorCode: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(ProjectOperationTable.id, context.operationId!),
          eq(ProjectOperationTable.projectId, context.projectId),
          eq(ProjectOperationTable.userId, context.userId),
          eq(ProjectOperationTable.kind, "delete"),
          or(
            eq(ProjectOperationTable.status, "queued"),
            eq(ProjectOperationTable.status, "running"),
          ),
          or(
            sql`${ProjectOperationTable.triggerRunId} IS NULL`,
            eq(ProjectOperationTable.triggerRunId, context.runId),
          ),
        ),
      )
      .returning();
    if (!updatedProjectOperation) return null;
    return {
      project: existingProject ?? null,
      operation: updatedProjectOperation,
    };
  });

export const completeProjectDeletionDb = async (
  context: ProjectSandboxLifecycleContext,
  expectedSandboxId: string | null,
) =>
  db.transaction(async (tx) => {
    const [existingProject] = await tx
      .select()
      .from(ProjectTable)
      .where(
        and(
          eq(ProjectTable.id, context.projectId),
          eq(ProjectTable.userId, context.userId),
        ),
      )
      .for("update");
    if (existingProject && existingProject.sandboxId !== expectedSandboxId) {
      throw new Error("The sandbox binding changed during cleanup.");
    }
    const [updatedProjectOperation] = await tx
      .update(ProjectOperationTable)
      .set({
        status: "succeeded",
        phase: "complete",
        errorCode: null,
        errorMessage: null,
        // Empty rechecks preserve the deadline; finding a sandbox resets it before deletion.
        finishedAt: sql`coalesce(${ProjectOperationTable.finishedAt}, now())`,
        nextDispatchAt: sql`now() + interval '5 minutes'`,
      })
      .where(
        and(
          eq(ProjectOperationTable.id, context.operationId!),
          eq(ProjectOperationTable.projectId, context.projectId),
          eq(ProjectOperationTable.userId, context.userId),
          eq(ProjectOperationTable.kind, "delete"),
          eq(ProjectOperationTable.status, "running"),
          eq(ProjectOperationTable.triggerRunId, context.runId),
        ),
      )
      .returning({ id: ProjectOperationTable.id });
    if (!updatedProjectOperation)
      throw new Error("The deletion run is no longer current.");

    // Only the worker calls this, after both saved-ID and deterministic-name lookups confirm absence.
    if (existingProject)
      await tx
        .delete(ProjectTable)
        .where(
          and(
            eq(ProjectTable.id, context.projectId),
            eq(ProjectTable.userId, context.userId),
          ),
        );
  });

export const markProjectSandboxDeletionPendingDb = async (
  context: ProjectSandboxLifecycleContext,
) => {
  const [updatedProjectOperation] = await db
    .update(ProjectOperationTable)
    .set({ finishedAt: null })
    .where(
      and(
        eq(ProjectOperationTable.id, context.operationId!),
        eq(ProjectOperationTable.projectId, context.projectId),
        eq(ProjectOperationTable.userId, context.userId),
        eq(ProjectOperationTable.kind, "delete"),
        eq(ProjectOperationTable.status, "running"),
        eq(ProjectOperationTable.triggerRunId, context.runId),
      ),
    )
    .returning({ id: ProjectOperationTable.id });
  if (!updatedProjectOperation)
    throw new Error("The deletion run is no longer current.");
};

export const queueProjectDeletionRetryDb = async (
  context: ProjectSandboxLifecycleContext,
) => {
  if (!context.operationId) return;
  await db
    .update(ProjectOperationTable)
    .set({
      status: "queued",
      triggerRunId: null,
      errorCode: "SANDBOX_DELETE_RETRY",
      errorMessage:
        "Sandbox cleanup has not finished. Deletion will retry automatically.",
      nextDispatchAt: sql`now() + interval '5 minutes'`,
    })
    .where(
      and(
        eq(ProjectOperationTable.id, context.operationId),
        eq(ProjectOperationTable.userId, context.userId),
        eq(ProjectOperationTable.kind, "delete"),
        eq(ProjectOperationTable.status, "running"),
        eq(ProjectOperationTable.triggerRunId, context.runId),
      ),
    );
};

export const projectDeletionRunSchema = z.object({
  id: z.string(),
  isCompleted: z.boolean(),
});
export type ProjectDeletionRunSchema = z.infer<typeof projectDeletionRunSchema>;

export const reconcileProjectDeletionRuns = async (deadline: number) => {
  const existingProjectOperations = await db
    .select()
    .from(ProjectOperationTable)
    .where(
      and(
        eq(ProjectOperationTable.kind, "delete"),
        isNotNull(ProjectOperationTable.triggerRunId),
        lte(ProjectOperationTable.nextDispatchAt, sql`now()`),
        or(
          sql`${ProjectOperationTable.finishedAt} is null`,
          sql`${ProjectOperationTable.finishedAt} > now() - interval '7 days'`,
        ),
      ),
    )
    .orderBy(asc(ProjectOperationTable.nextDispatchAt))
    .limit(5);
  if (existingProjectOperations.length === 0) return;
  const { serverEnv } = await import("@/data/env/server");
  for (const operation of existingProjectOperations) {
    if (Date.now() >= deadline) break;
    try {
      const response = await fetch(
        `https://api.trigger.dev/api/v3/runs/${encodeURIComponent(operation.triggerRunId!)}`,
        {
          headers: { Authorization: `Bearer ${serverEnv.TRIGGER_SECRET_KEY}` },
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error("Unable to check the cleanup run.");
      const run = projectDeletionRunSchema.parse(await response.json());
      if (run.id !== operation.triggerRunId)
        throw new Error("Unexpected cleanup run.");
      // Terminal does not mean deletion succeeded. Always verify Daytona again, including
      // after crashes/cancellation and during the seven-day late-creation recovery window.
      await db
        .update(ProjectOperationTable)
        .set(
          run.isCompleted
            ? { status: "queued", triggerRunId: null }
            : { nextDispatchAt: sql`now() + interval '1 minute'` },
        )
        .where(
          and(
            eq(ProjectOperationTable.id, operation.id),
            eq(ProjectOperationTable.triggerRunId, run.id),
            lte(ProjectOperationTable.nextDispatchAt, sql`now()`),
          ),
        );
    } catch {
      console.error(
        "Unable to check sandbox cleanup; the project deletion remains recorded.",
        { operationId: operation.id },
      );
      // Give other due operations a turn when a run-status endpoint keeps failing.
      await db
        .update(ProjectOperationTable)
        .set({ nextDispatchAt: sql`now() + interval '1 minute'` })
        .where(
          and(
            eq(ProjectOperationTable.id, operation.id),
            eq(ProjectOperationTable.triggerRunId, operation.triggerRunId!),
            lte(ProjectOperationTable.nextDispatchAt, sql`now()`),
          ),
        );
    }
  }
};
