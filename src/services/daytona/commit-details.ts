import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getUserReadyProject } from "@/features/projects/server/project-workspace";
import { projectCommitDetailsParamsSchema } from "@/features/projects/actions/commit-details-schemas";
import { validateProjectCommitDetails } from "@/features/projects/server/commit-details";
import { projectCommitDetailsLimits } from "@/features/projects/constants";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { sandboxCommitDetailsCommand } from "./commit-details-command";

const throwCommitDetailsError = (code: string): never => {
  switch (code) {
    case "COMMIT_NOT_FOUND":
      throw new SandboxFilesError(
        404,
        code,
        "This commit could not be found in your workspace.",
      );
    case "COMMIT_PARENT_UNAVAILABLE":
      throw new SandboxFilesError(
        409,
        code,
        "This commit’s parent is unavailable. More repository history is needed to show its changes.",
      );
    case "WORKSPACE_UNAVAILABLE":
      throw new SandboxFilesError(
        409,
        code,
        "The project repository is unavailable or unsupported.",
      );
    case "UNSUPPORTED_PATH":
      throw new SandboxFilesError(
        422,
        code,
        "A repository path cannot be represented safely.",
      );
    case "COMMIT_DIFF_TOO_LARGE":
      throw new SandboxFilesError(
        413,
        code,
        "This commit is too large to load in one response.",
      );
    default:
      throw new SandboxFilesError(
        502,
        "COMMIT_DETAILS_UNAVAILABLE",
        "Unable to load commit details. Please try again.",
      );
  }
};

export const readSandboxCommitDetails = async (
  headers: Headers,
  projectId: string,
  commitSha: string,
  signal?: AbortSignal,
) => {
  try {
    signal?.throwIfAborted();
    const { userId } = await getCurrentUser(headers);
    if (!userId)
      throw new SandboxFilesError(
        401,
        "UNAUTHENTICATED",
        "Sign in to view commit details.",
      );
    const params = projectCommitDetailsParamsSchema.safeParse({
      projectId,
      commitSha,
      source: "local",
    });
    if (!params.success)
      throw new SandboxFilesError(
        400,
        "INVALID_COMMIT_PARAMS",
        "Invalid project or commit SHA.",
      );
    const existingProject = await getUserReadyProject(userId, projectId);
    const deadline = AbortSignal.timeout(30_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, deadline])
      : deadline;
    requestSignal.throwIfAborted();
    const toolbox = await getSandboxToolboxUrl(
      existingProject.sandboxId,
      projectId,
    );
    requestSignal.throwIfAborted();
    const { dir: home } = z
      .object({ dir: z.string().startsWith("/").min(2) })
      .parse(
        await requestDaytona(`${toolbox}/user-home-dir`, {
          signal: requestSignal,
        }),
      );
    const response = z
      .object({
        exitCode: z.number().int(),
        result: z.string().max(projectCommitDetailsLimits.maxResponseBytes),
      })
      .parse(
        await requestDaytona(`${toolbox}/process/execute`, {
          method: "POST",
          signal: requestSignal,
          body: JSON.stringify(
            createSandboxCommand(
              sandboxCommitDetailsCommand,
              { home, commitSha },
              12,
            ),
          ),
        }),
      );
    requestSignal.throwIfAborted();
    const result: unknown = JSON.parse(response.result);
    if (response.exitCode !== 0)
      throwCommitDetailsError(
        z.object({ code: z.string() }).parse(result).code,
      );
    return validateProjectCommitDetails(result, params.data);
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    return throwCommitDetailsError("COMMIT_DETAILS_UNAVAILABLE");
  }
};
