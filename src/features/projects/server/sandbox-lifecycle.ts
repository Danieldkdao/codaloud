import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { ProjectTable } from "@/db/schemas/project";
import { ProjectOperationTable } from "@/db/schemas/project-operation";
import type {
  ProjectSandboxLifecycleContext,
  ProjectSandboxLifecycleTransition,
} from "@/features/projects/types";

export const transitionProjectSandboxDb = async (
  context: ProjectSandboxLifecycleContext,
  transition: ProjectSandboxLifecycleTransition,
) => db.transaction(async (tx) => {
  const [existingProject] = await tx.select().from(ProjectTable).where(and(
    eq(ProjectTable.id, context.projectId),
    eq(ProjectTable.userId, context.userId),
  )).for("update");
  if (!existingProject) return null;

  const [deletingProjectOperation] = await tx.select({ id: ProjectOperationTable.id }).from(ProjectOperationTable).where(and(
    eq(ProjectOperationTable.projectId, context.projectId),
    eq(ProjectOperationTable.userId, context.userId), eq(ProjectOperationTable.kind, "delete"),
  )).limit(1);
  if (deletingProjectOperation) return null;

  // Until activeOperationId exists, only the latest operation may update this project.
  const [existingProjectOperation] = await tx.select().from(ProjectOperationTable).where(and(
    eq(ProjectOperationTable.projectId, context.projectId),
    eq(ProjectOperationTable.userId, context.userId),
  )).orderBy(desc(ProjectOperationTable.createdAt), desc(ProjectOperationTable.id))
    .limit(1).for("update");

  if (
    !existingProjectOperation || existingProjectOperation.kind !== "prepare" ||
    (context.operationId
      ? existingProjectOperation.id !== context.operationId
      // Legacy payloads may only use an operation already bound to this exact run.
      : existingProjectOperation.triggerRunId !== context.runId) ||
    (existingProjectOperation.triggerRunId !== null && existingProjectOperation.triggerRunId !== context.runId) ||
    ((transition.action === "attach" || transition.action === "complete") &&
      existingProjectOperation.triggerRunId !== context.runId)
  ) return null;

  // A retry after a lost completion response returns the recorded result.
  if (transition.action === "start" && existingProjectOperation.status === "succeeded" &&
    existingProjectOperation.triggerRunId === context.runId && existingProject.sandboxId) {
    return { project: existingProject, operationId: existingProjectOperation.id, completed: true };
  }
  if (!["queued", "running"].includes(existingProjectOperation.status)) return null;

  if ((transition.action === "attach" || transition.action === "complete") && existingProject.sandboxId !== null &&
    existingProject.sandboxId !== transition.sandboxId) return null;
  if (transition.action === "complete" && existingProject.sandboxId !== transition.sandboxId) return null;

  const failed = transition.action === "fail";
  const completed = transition.action === "complete";
  const errorMessage = failed ? "Workspace setup failed. Please try setup again." : null;
  await tx.update(ProjectOperationTable).set({
    triggerRunId: context.runId,
    status: failed ? "failed" : completed ? "succeeded" : "running",
    phase: failed ? existingProjectOperation.phase
      : completed ? "complete" : transition.action === "start" ? "creating-sandbox" : "starting-sandbox",
    errorCode: failed ? "SANDBOX_SETUP_FAILED" : null,
    errorMessage,
    finishedAt: failed || completed ? new Date() : null,
  }).where(eq(ProjectOperationTable.id, existingProjectOperation.id));

  const [updatedProject] = await tx.update(ProjectTable).set({
    // For this milestone, ready means sandbox startup completed; file preparation is separate.
    // Commit readiness together with the operation result and preserve it on reopen.
    setupStatus: existingProject.setupStatus === "ready" || completed ? "ready" : failed ? "failed" : "running",
    setupError: existingProject.setupStatus === "ready" ? null : errorMessage,
    ...(transition.action === "attach" ? { sandboxId: transition.sandboxId } : {}),
  }).where(eq(ProjectTable.id, existingProject.id)).returning();

  return { project: updatedProject, operationId: existingProjectOperation.id, completed };
});
