import { Daytona, DaytonaNotFoundError, type Sandbox } from "@daytona/sdk";
import { AbortTaskRunError, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const handleProjectSandboxSchema = z.strictObject({
  projectId: z.uuid(),
  userId: z.uuid(),
  operationId: z.uuid().optional(),
});

export type HandleProjectSandboxSchema = z.infer<
  typeof handleProjectSandboxSchema
>;

export const handleProjectSandbox = schemaTask({
  id: "handle-project-sandbox",
  schema: handleProjectSandboxSchema,
  queue: { concurrencyLimit: 1 },
  maxDuration: 300,
  run: async ({ projectId, userId, operationId }, { ctx }) => {
    // Validate server configuration at execution time, not during task discovery.
    const { serverEnv } = await import("@/data/env/server");
    const { deleteProjectSandbox, getProjectSandboxName } = await import("@/services/daytona/delete-project-sandbox");
    const { transitionProjectSandboxDb } = await import("@/features/projects/server/sandbox-lifecycle");
    const lifecycle = { projectId, userId, operationId, runId: ctx.run.id };
    const { readProjectDeletionOperationDb } = await import("@/features/projects/server/project-deletion");
    // Deletion uses this same task and per-project queue, so it follows in-flight setup.
    if (await readProjectDeletionOperationDb(lifecycle)) return deleteProjectSandbox(lifecycle);
    const startedProjectOperation = await transitionProjectSandboxDb(lifecycle, { action: "start" });

    if (!startedProjectOperation) {
      throw new AbortTaskRunError("The project setup operation is no longer current.");
    }
    const existingProject = startedProjectOperation.project;
    lifecycle.operationId = startedProjectOperation.operationId;
    if (startedProjectOperation.completed) {
      return { projectId: existingProject.id, sandboxId: existingProject.sandboxId };
    }

    const daytona = new Daytona({
      apiKey: serverEnv.DAYTONA_API_KEY,
      target: serverEnv.DAYTONA_TARGET,
      otelEnabled: false,
    });
    // Keep this stable so a retry can recover creation before the ID was saved.
    const sandboxName = getProjectSandboxName(existingProject.id);
    let sandbox: Sandbox;

    try {
      sandbox = await daytona.get(existingProject.sandboxId ?? sandboxName);
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error;

      if (existingProject.sandboxId) {
        throw new AbortTaskRunError(
          "The saved project sandbox could not be found.",
        );
      }

      sandbox = await daytona.create(
        {
          snapshot: "daytona-medium",
          name: sandboxName,
          labels: {
            codaloudApp: "codaloud",
            codaloudProjectId: existingProject.id,
          },
          public: false,
          ephemeral: false,
          autoStopInterval: 5,
          autoArchiveInterval: 60,
          autoDeleteInterval: -1,
          ttlMinutes: 0,
        },
        { timeout: 120 },
      );
    }

    if (
      sandbox.labels?.codaloudApp !== "codaloud" ||
      sandbox.labels?.codaloudProjectId !== existingProject.id
    ) {
      throw new AbortTaskRunError("The sandbox does not match this project.");
    }

    const updatedProjectOperation = await transitionProjectSandboxDb(lifecycle, {
      action: "attach", sandboxId: sandbox.id,
    });

    if (!updatedProjectOperation) {
      throw new AbortTaskRunError(
        "The project was removed or its sandbox changed.",
      );
    }

    if (sandbox.state === "stopped" || sandbox.state === "archived") {
      await sandbox.start(120);
    } else if (sandbox.state !== "started") {
      await sandbox.waitUntilStarted(120);
    }

    const completedProjectOperation = await transitionProjectSandboxDb(lifecycle, {
      action: "complete", sandboxId: sandbox.id,
    });
    if (!completedProjectOperation) {
      throw new AbortTaskRunError("The project setup operation is no longer current.");
    }

    return { projectId: existingProject.id, sandboxId: sandbox.id };
  },
  onFailure: async ({ payload, ctx }) => {
    const { readProjectDeletionOperationDb, queueProjectDeletionRetryDb } = await import("@/features/projects/server/project-deletion");
    const lifecycle = { ...payload, runId: ctx.run.id };
    if (await readProjectDeletionOperationDb(lifecycle)) {
      await queueProjectDeletionRetryDb(lifecycle);
      return;
    }
    const { transitionProjectSandboxDb } = await import("@/features/projects/server/sandbox-lifecycle");
    await transitionProjectSandboxDb({ ...payload, runId: ctx.run.id }, { action: "fail" });
  },
});
