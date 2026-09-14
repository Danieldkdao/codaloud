import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getUserReadyProject } from "@/features/projects/server/project-workspace";
import { projectChangePathSchema } from "@/features/projects/actions/change-schemas";
import { projectBranchNameSchema } from "@/features/projects/actions/branch-schemas";
import { commitHashSchema } from "@/features/projects/actions/commit-schemas";
import { getSandboxGitRepository } from "./branches";
import { requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { sandboxStageChangesCommand } from "./stage-changes-command";

export const sandboxStageSelectionSchema = z.object({
  paths: z.array(projectChangePathSchema).min(1).max(10000),
  currentBranch: projectBranchNameSchema,
  headSha: commitHashSchema.nullable(),
});
export type SandboxStageSelectionSchema = z.infer<
  typeof sandboxStageSelectionSchema
>;

export const sandboxStagedChangesSchema = sandboxStageSelectionSchema
  .omit({ paths: true })
  .extend({
    stagedPaths: z.array(projectChangePathSchema).min(1).max(10000),
    indexFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  });
export type SandboxStagedChangesSchema = z.infer<
  typeof sandboxStagedChangesSchema
>;

export const stageSandboxChanges = async (
  headers: Headers,
  projectId: string,
  selection: SandboxStageSelectionSchema,
  signal?: AbortSignal,
) => {
  const input = sandboxStageSelectionSchema.parse(selection);
  const { userId } = await getCurrentUser(headers);
  if (!userId)
    throw new SandboxFilesError(
      401,
      "UNAUTHENTICATED",
      "Sign in to stage changes.",
    );
  const existingProject = await getUserReadyProject(userId, projectId);
  const repository = await getSandboxGitRepository(
    existingProject.sandboxId,
    projectId,
  );
  signal?.throwIfAborted();
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  const unknownOutcome = () =>
    new SandboxFilesError(
      502,
      "COMMIT_STAGING_OUTCOME_UNKNOWN",
      "Unable to confirm staging. Refresh Git changes before retrying; files may already be staged.",
    );
  let response;
  try {
    response = z
      .object({
        exitCode: z.number().int(),
        result: z.string().max(8 * 1024 * 1024),
      })
      .parse(
        await requestDaytona(`${repository.toolboxUrl}/process/execute`, {
          method: "POST",
          signal: requestSignal,
          body: JSON.stringify(
            createSandboxCommand(
              sandboxStageChangesCommand,
              { ...input, repositoryPath: repository.repositoryPath },
              15,
            ),
          ),
        }),
      );
    if (response.exitCode === 0) {
      const result = sandboxStagedChangesSchema.parse(
        JSON.parse(response.result),
      );
      const expected = new Set(input.paths);
      if (
        result.currentBranch !== input.currentBranch ||
        result.headSha !== input.headSha ||
        result.stagedPaths.length !== expected.size ||
        new Set(result.stagedPaths).size !== expected.size ||
        result.stagedPaths.some((path) => !expected.has(path))
      )
        throw unknownOutcome();
      return result;
    }
  } catch {
    throw unknownOutcome();
  }
  let code: string;
  try {
    code = z
      .object({ code: z.string() })
      .parse(JSON.parse(response.result)).code;
  } catch {
    throw unknownOutcome();
  }
  switch (code) {
    case "COMMIT_UNSELECTED_STAGED_CHANGES":
      throw new SandboxFilesError(
        409,
        code,
        "Other files are already staged. Include them in the selection or unstage them before continuing.",
      );
    case "COMMIT_STAGING_BUSY":
      throw new SandboxFilesError(
        409,
        code,
        "Another Git operation holds the index lock. Wait for it to finish before trying again.",
      );
    case "COMMIT_SELECTION_CHANGED":
    case "WORKSPACE_CHANGED":
      throw new SandboxFilesError(
        409,
        code,
        "The checkout or selected changes changed before staging completed. Refresh and select the files again.",
      );
    case "COMMIT_UNRESOLVED_CONFLICTS":
      throw new SandboxFilesError(
        409,
        code,
        "Finish the current Git operation and resolve conflicts before staging these changes.",
      );
    case "COMMIT_UNSUPPORTED_FILE":
    case "COMMIT_UNSUPPORTED_FILTER":
      throw new SandboxFilesError(
        422,
        code,
        "The selection uses an unsupported file type, sparse checkout, or Git content filter.",
      );
    case "COMMIT_STAGING_FAILED":
      throw new SandboxFilesError(
        502,
        code,
        "Staging failed. Refresh Git changes before trying again.",
      );
    default:
      throw unknownOutcome();
  }
};
