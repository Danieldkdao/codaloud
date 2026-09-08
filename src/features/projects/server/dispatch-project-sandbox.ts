import { z } from "zod";

import type { ProjectOperationSelectData } from "@/db/schemas/project-operation";
import type { StartProjectSandboxSchema } from "@/trigger/projects/start-project-sandbox";

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
