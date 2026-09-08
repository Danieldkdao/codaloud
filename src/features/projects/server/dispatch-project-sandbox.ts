import { z } from "zod";

import type { ProjectOperationSelectData } from "@/db/schemas/project-operation";
import type { StartProjectSandboxSchema } from "@/trigger/projects/start-project-sandbox";
import {
  claimProjectSandboxDispatchDb,
  recordProjectSandboxDispatchFailureDb,
  updateProjectOperationRunDb,
} from "@/features/projects/server/project-operations";

export const projectSandboxRunSchema = z.object({
  id: z.string().trim().min(1),
});

export type ProjectSandboxRunSchema = z.infer<typeof projectSandboxRunSchema>;

export const dispatchProjectSandbox = async (
  operation: Pick<ProjectOperationSelectData, "id" | "projectId" | "userId">,
) => {
  const { serverEnv } = await import("@/data/env/server");
  const payload: StartProjectSandboxSchema = {
    projectId: operation.projectId,
    userId: operation.userId,
    operationId: operation.id,
  };

  // Keep the Node worker and Daytona SDK out of the Expo API runtime.
  const response = await fetch(
    "https://api.trigger.dev/api/v1/tasks/start-project-sandbox/trigger",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.TRIGGER_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload,
        options: {
          idempotencyKey: `start-project-sandbox:${operation.id}`,
          concurrencyKey: operation.projectId,
        },
      }),
      // Accepted setup belongs to the project even if the phone disconnects.
      signal: AbortSignal.timeout(5_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Sandbox task submission failed with HTTP ${response.status}.`);
  }

  return projectSandboxRunSchema.parse(await response.json());
};

export const submitProjectSandbox = async (operationId: string, userId: string) => {
  const claimedProjectOperation = await claimProjectSandboxDispatchDb(operationId, userId);
  if (!claimedProjectOperation) return false;

  try {
    // Both callers use REST so the retry's parent Trigger run cannot change the key.
    const run = await dispatchProjectSandbox(claimedProjectOperation);
    const updatedProjectOperation = await updateProjectOperationRunDb(
      claimedProjectOperation.id,
      claimedProjectOperation.userId,
      run.id,
      claimedProjectOperation.dispatchAttempts,
    );

    if (!updatedProjectOperation) {
      throw new Error("The setup operation could not be linked to its run.");
    }

    return true;
  } catch (error) {
    // Keep queued work recoverable even when submission or acknowledgement is ambiguous.
    await recordProjectSandboxDispatchFailureDb(
      claimedProjectOperation.id,
      claimedProjectOperation.userId,
      claimedProjectOperation.dispatchAttempts,
    );
    throw error;
  }
};
