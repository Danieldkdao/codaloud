import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getUserReadyProject } from "@/features/projects/server/project-workspace";
import {
  projectCommitMessageSchema,
  projectCreatedCommitSchema,
} from "@/features/projects/actions/create-commit-schemas";
import { getSandboxGitRepository } from "./branches";
import { requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import {
  sandboxStagedChangesSchema,
  type SandboxStagedChangesSchema,
} from "./stage-changes";
import { sandboxCommitChangesCommand } from "./commit-changes-command";

export const commitSandboxChanges = async (
  headers: Headers,
  projectId: string,
  staged: SandboxStagedChangesSchema,
  message: string,
  signal?: AbortSignal,
) => {
  const selection = sandboxStagedChangesSchema.parse(staged);
  const commitMessage = projectCommitMessageSchema.parse(message);
  const { userId, user } = await getCurrentUser(headers);
  if (!userId)
    throw new SandboxFilesError(
      401,
      "UNAUTHENTICATED",
      "Sign in to commit changes.",
    );
  const name = z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^[^<>\x00-\x1f\x7f]+$/)
    .safeParse(user?.name);
  const email = z.email().safeParse(user?.email);
  if (!name.success || !email.success) {
    throw new SandboxFilesError(
      422,
      "COMMIT_AUTHOR_REQUIRED",
      "Add a valid name and email to your account before committing.",
    );
  }
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
      "COMMIT_OUTCOME_UNKNOWN",
      "Unable to confirm the commit. Refresh commit history and Git changes before retrying; the commit may already exist.",
    );
  let response;
  try {
    response = z
      .object({
        exitCode: z.number().int(),
        result: z.string().max(1024 * 1024),
      })
      .parse(
        await requestDaytona(`${repository.toolboxUrl}/process/execute`, {
          method: "POST",
          signal: requestSignal,
          body: JSON.stringify(
            createSandboxCommand(
              sandboxCommitChangesCommand,
              {
                ...selection,
                repositoryPath: repository.repositoryPath,
                message: commitMessage,
                author: { name: name.data, email: email.data },
              },
              15,
            ),
          ),
        }),
      );
    if (response.exitCode === 0) {
      const result = projectCreatedCommitSchema.parse(
        JSON.parse(response.result),
      );
      if (
        result.currentBranch !== selection.currentBranch ||
        result.parentHash !== selection.headSha ||
        result.hash === selection.headSha
      )
        throw unknownOutcome();
      return result;
    }
  } catch {
    // Never retry a mutating request whose response may have been lost.
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
    case "WORKSPACE_CHANGED":
    case "COMMIT_INDEX_CHANGED":
      throw new SandboxFilesError(
        409,
        code,
        "The checkout or staged changes changed. Refresh Git changes before trying again.",
      );
    case "COMMIT_BUSY":
      throw new SandboxFilesError(
        409,
        code,
        "Another Git operation holds a lock. Wait for it to finish before trying again.",
      );
    case "COMMIT_UNRESOLVED_CONFLICTS":
      throw new SandboxFilesError(
        409,
        code,
        "Finish the current Git operation and resolve conflicts before committing.",
      );
    case "COMMIT_FAILED":
      throw new SandboxFilesError(
        502,
        code,
        "The commit failed. Your selected changes remain staged.",
      );
    default:
      throw unknownOutcome();
  }
};
