import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getUserReadyProject } from "@/features/projects/server/project-workspace";
import {
  commitHashSchema,
  projectCommitSchema,
  type ProjectCommitQueryInput,
} from "@/features/projects/actions/commit-schemas";
import {
  CommitHistoryError,
  createCommitScope,
  paginateCommitHistory,
  parseCommitQuery,
  readCommitCursor,
} from "@/features/projects/server/commit-pagination";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";
import { createSandboxCommand } from "./create-command";
import { sandboxCommitsCommand } from "./commits-command";

const sandboxCommitBatchSchema = z.object({
  snapshotSha: commitHashSchema.nullable(),
  isShallow: z.boolean(),
  commits: z.array(projectCommitSchema).max(100),
  hasNextPage: z.boolean(),
});
export type SandboxCommitBatchSchema = z.infer<typeof sandboxCommitBatchSchema>;

export const readSandboxCommits = async (
  headers: Headers,
  projectId: string,
  input: ProjectCommitQueryInput,
  signal?: AbortSignal,
) => {
  try {
    signal?.throwIfAborted();
    const { userId } = await getCurrentUser(headers);
    if (!userId)
      throw new CommitHistoryError(
        401,
        "UNAUTHENTICATED",
        "Sign in to view commit history.",
      );
    const query = parseCommitQuery(projectId, input);
    const existingProject = await getUserReadyProject(userId, projectId);
    const scope = createCommitScope(
      userId,
      projectId,
      "local",
      existingProject.sandboxId,
      query,
    );
    const cursor = readCommitCursor(query.cursor, scope);
    const deadline = AbortSignal.timeout(30_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, deadline])
      : deadline;
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
    const execute = async (
      snapshotSha?: string,
      page?: number,
      pageSize?: number,
    ) => {
      requestSignal.throwIfAborted();
      const response = z
        .object({
          exitCode: z.number(),
          result: z.string().max(4 * 1024 * 1024),
        })
        .parse(
          await requestDaytona(`${toolbox}/process/execute`, {
            method: "POST",
            signal: requestSignal,
            body: JSON.stringify(
              createSandboxCommand(
                sandboxCommitsCommand,
                {
                  home,
                  branch: query.branch,
                  snapshotSha,
                  page,
                  pageSize,
                  allowEmptyRepository: !existingProject.githubRepositoryId,
                },
                12,
              ),
            ),
          }),
        );
      const result: unknown = JSON.parse(response.result);
      if (response.exitCode !== 0) {
        const { code } = z.object({ code: z.string() }).parse(result);
        if (code === "BRANCH_NOT_FOUND")
          throw new CommitHistoryError(
            404,
            code,
            "The selected local branch no longer exists.",
          );
        if (code === "HISTORY_SNAPSHOT_UNAVAILABLE")
          throw new CommitHistoryError(
            409,
            code,
            "This history is no longer available. Refresh the history.",
          );
        throw new CommitHistoryError(
          502,
          "COMMITS_UNAVAILABLE",
          "Unable to read workspace commit history.",
        );
      }
      return sandboxCommitBatchSchema.parse(result);
    };
    const snapshot = await execute(cursor?.snapshotSha);
    return await paginateCommitHistory({
      query,
      scope,
      cursor,
      snapshotSha: snapshot.snapshotSha,
      isShallow: snapshot.isShallow,
      signal: requestSignal,
      loadBatch: async (page, pageSize) => {
        const batch = await execute(
          snapshot.snapshotSha ?? undefined,
          page,
          pageSize,
        );
        if (batch.snapshotSha !== snapshot.snapshotSha)
          throw new Error("Snapshot changed");
        return { items: batch.commits, hasNextPage: batch.hasNextPage };
      },
    });
  } catch (error) {
    if (
      error instanceof CommitHistoryError ||
      error instanceof SandboxFilesError
    )
      throw error;
    throw new CommitHistoryError(
      502,
      "COMMITS_UNAVAILABLE",
      "Unable to read workspace commit history. Please try again.",
    );
  }
};
