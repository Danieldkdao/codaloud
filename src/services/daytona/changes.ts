import { isValidIds } from "@/lib/utils";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getUserReadyProject } from "@/features/projects/server/project-workspace";
import { projectRepositoryChangesSchema } from "@/features/projects/actions/change-schemas";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { sandboxChangesCommand } from "./changes-command";

const throwChangesError = (code: string): never => {
  switch (code) {
    case "CHANGES_TOO_LARGE":
      throw new SandboxFilesError(413, code, "There are too many changes to load in one response.");
    case "WORKSPACE_CHANGED":
      throw new SandboxFilesError(409, code, "Your workspace changed while loading changes. Please refresh.");
    case "WORKSPACE_UNAVAILABLE":
      throw new SandboxFilesError(409, code, "The project repository is unavailable or unsupported.");
    case "UNSUPPORTED_PATH":
      throw new SandboxFilesError(422, code, "A repository path cannot be represented safely.");
    default:
      throw new SandboxFilesError(502, "CHANGES_UNAVAILABLE", "Unable to read workspace changes. Please try again.");
  }
};

export const readSandboxChanges = async (headers: Headers, projectId: string, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted();
    const { userId } = await getCurrentUser(headers);
    if (!userId) throw new SandboxFilesError(401, "UNAUTHENTICATED", "Sign in to view project changes.");
    if (!isValidIds(projectId)) throw new SandboxFilesError(400, "INVALID_PROJECT", "Invalid project ID.");
    const existingProject = await getUserReadyProject(userId, projectId);
    const deadline = AbortSignal.timeout(30_000);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const toolbox = await getSandboxToolboxUrl(existingProject.sandboxId, projectId);
    requestSignal.throwIfAborted();
    const { dir: home } = z.object({ dir: z.string().startsWith("/").min(2) }).parse(
      await requestDaytona(`${toolbox}/user-home-dir`, { signal: requestSignal }),
    );
    const response = z.object({ exitCode: z.number().int(), result: z.string().max(8 * 1024 * 1024) }).parse(
      await requestDaytona(`${toolbox}/process/execute`, {
        method: "POST", signal: requestSignal,
        body: JSON.stringify(createSandboxCommand(sandboxChangesCommand, {
          home, allowEmptyRepository: !existingProject.githubRepositoryId,
        }, 12)),
      }),
    );
    requestSignal.throwIfAborted();
    const result: unknown = JSON.parse(response.result);
    if (response.exitCode !== 0) throwChangesError(z.object({ code: z.string() }).parse(result).code);
    return projectRepositoryChangesSchema.parse(result);
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    return throwChangesError("CHANGES_UNAVAILABLE");
  }
};
