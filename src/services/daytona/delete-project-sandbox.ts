import { Daytona, DaytonaNotFoundError } from "@daytona/sdk";
import {
  beginProjectDeletionDb,
  completeProjectDeletionDb,
  markProjectSandboxDeletionPendingDb,
} from "@/features/projects/server/project-deletion";
import type { ProjectSandboxLifecycleContext } from "@/features/projects/types";

export const getProjectSandboxName = (projectId: string) => `codaloud-production-${projectId}`;

export const deleteProjectSandbox = async (context: ProjectSandboxLifecycleContext) => {
  const deletion = await beginProjectDeletionDb(context);
  if (!deletion) return { outcome: "superseded" };
  const { serverEnv } = await import("@/data/env/server");
  const daytona = new Daytona({ apiKey: serverEnv.DAYTONA_API_KEY, target: serverEnv.DAYTONA_TARGET, otelEnabled: false });
  const identifiers = [...new Set([
    ...(deletion.project?.sandboxId ? [deletion.project.sandboxId] : []),
    getProjectSandboxName(context.projectId),
  ])];

  for (const identifier of identifiers) {
    let sandbox;
    try {
      sandbox = await daytona.get(identifier);
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) continue;
      throw error;
    }
    if (sandbox.labels?.codaloudApp !== "codaloud" || sandbox.labels?.codaloudProjectId !== context.projectId) {
      throw new Error("The sandbox does not belong to this project.");
    }
    // A newly discovered sandbox must be cleaned up even if the seven-day check window expires.
    await markProjectSandboxDeletionPendingDb(context);
    try {
      await sandbox.delete(120, true);
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error;
    }
  }

  // A delete response can be accepted before destruction completes. Only a confirmed
  // not-found response is sufficient to remove the project and its saved binding.
  for (const identifier of identifiers) {
    try {
      await daytona.get(identifier);
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) continue;
      throw error;
    }
    throw new Error("Sandbox destruction has not completed.");
  }
  await completeProjectDeletionDb(context, deletion.project?.sandboxId ?? null);
  return { outcome: "deleted", projectId: context.projectId };
};
