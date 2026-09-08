import { Daytona, DaytonaNotFoundError, type Sandbox } from "@daytona/sdk";
import { AbortTaskRunError, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const startProjectSandboxSchema = z.strictObject({
  projectId: z.uuid(),
  userId: z.uuid(),
});

export type StartProjectSandboxSchema = z.infer<
  typeof startProjectSandboxSchema
>;

export const startProjectSandbox = schemaTask({
  id: "start-project-sandbox",
  schema: startProjectSandboxSchema,
  queue: { concurrencyLimit: 1 },
  maxDuration: 300,
  run: async ({ projectId, userId }) => {
    // Validate server configuration at execution time, not during task discovery.
    const { serverEnv } = await import("@/data/env/server");
    const { confirmUserProjectOwnership, updateUserProjectSandboxDb } =
      await import("@/features/projects/server/projects");
    const existingProject = await confirmUserProjectOwnership(
      userId,
      projectId,
    );

    if (!existingProject) {
      throw new AbortTaskRunError("Project not found for this user.");
    }

    const daytona = new Daytona({
      apiKey: serverEnv.DAYTONA_API_KEY,
      target: serverEnv.DAYTONA_TARGET,
      otelEnabled: false,
    });
    // Keep this stable so a retry can recover creation before the ID was saved.
    const sandboxName = `codaloud-production-${existingProject.id}`;
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

    // Persist the binding before further work; file preparation will mark setup ready.
    const updatedProject = await updateUserProjectSandboxDb(
      userId,
      existingProject.id,
      sandbox.id,
    );

    if (!updatedProject) {
      throw new AbortTaskRunError(
        "The project was removed or its sandbox changed.",
      );
    }

    if (sandbox.state === "stopped" || sandbox.state === "archived") {
      await sandbox.start(120);
    } else if (sandbox.state !== "started") {
      await sandbox.waitUntilStarted(120);
    }

    return { projectId: updatedProject.id, sandboxId: sandbox.id };
  },
});
