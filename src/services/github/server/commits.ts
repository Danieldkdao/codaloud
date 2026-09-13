import { RequestError } from "octokit";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { confirmUserProjectOwnership } from "@/features/projects/server/projects";
import { commitHashSchema, projectCommitSchema, type ProjectCommitQueryInput } from "@/features/projects/actions/commit-schemas";
import { CommitHistoryError, createCommitScope, paginateCommitHistory, parseCommitQuery, readCommitCursor } from "@/features/projects/server/commit-pagination";
import { getGitHubCredentials, getGitHubErrorResponse } from "./access";
import { createGitHubClient, verifyGitHubRepositoryAccess } from "./repositories";

const gitHubCommitBranchSchema = z.object({ name: z.string(), commit: z.object({ sha: commitHashSchema }) });
export type GitHubCommitBranchSchema = z.infer<typeof gitHubCommitBranchSchema>;

export const readGitHubCommits = async (headers: Headers, projectId: string, input: ProjectCommitQueryInput, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted();
    const { userId } = await getCurrentUser(headers);
    if (!userId) throw new CommitHistoryError(401, "UNAUTHENTICATED", "Sign in to view commit history.");
    const query = parseCommitQuery(projectId, input);
    const existingProject = await confirmUserProjectOwnership(userId, projectId);
    if (!existingProject) throw new CommitHistoryError(404, "PROJECT_NOT_FOUND", "Project not found.");
    if (existingProject.deletionRequested) throw new CommitHistoryError(409, "PROJECT_DELETING", "This project is being deleted.");
    if (!existingProject.githubRepositoryId) throw new CommitHistoryError(409, "GITHUB_REPOSITORY_REQUIRED", "This project has no linked GitHub repository.");

    // Use the repository on the owned project and the linked account in this session.
    // Remote history is independent of sandbox setup and power state.
    const { accessToken, accountId } = await getGitHubCredentials(headers);
    const scope = createCommitScope(userId, projectId, "remote", `${existingProject.githubRepositoryId}:${accountId}`, query);
    const cursor = readCommitCursor(query.cursor, scope);
    const deadline = AbortSignal.timeout(30_000);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    requestSignal.throwIfAborted();
    const repository = await verifyGitHubRepositoryAccess(accessToken, existingProject.githubRepositoryId, requestSignal);
    const [owner, repo] = repository.fullName.split("/");
    const octokit = createGitHubClient(accessToken, requestSignal);
    let branch;
    try {
      const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch: query.branch });
      branch = gitHubCommitBranchSchema.parse(data);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        throw new CommitHistoryError(404, "BRANCH_NOT_FOUND", "The selected remote branch no longer exists.");
      }
      throw error;
    }
    if (branch.name !== query.branch) throw new CommitHistoryError(404, "BRANCH_NOT_FOUND", "The selected remote branch was renamed. Refresh the branches.");
    const snapshotSha = cursor?.snapshotSha ?? branch.commit.sha;

    return await paginateCommitHistory({
      query, scope, cursor, snapshotSha, signal: requestSignal,
      loadBatch: async (page, pageSize) => {
        const { data, headers: responseHeaders } = await octokit.rest.repos.listCommits({ owner, repo, sha: snapshotSha, page, per_page: pageSize }).catch((error: unknown) => {
          if (cursor && error instanceof RequestError && (error.status === 404 || error.status === 422)) {
            throw new CommitHistoryError(409, "HISTORY_SNAPSHOT_UNAVAILABLE", "This history is no longer available. Refresh the history.");
          }
          throw error;
        });
        const items = projectCommitSchema.array().max(pageSize).parse(data.map((item) => ({
          hash: item.sha,
          message: item.commit.message,
          // Git author metadata remains available even without an associated GitHub profile.
          author: item.commit.author?.name ?? item.author?.login ?? "Unknown author",
          authorEmail: item.commit.author?.email ?? "",
          committedAt: item.commit.committer?.date ?? item.commit.author?.date,
          parentHashes: item.parents.map((parent) => parent.sha),
          isMerge: item.parents.length > 1,
        })));
        return { items, hasNextPage: /;\s*rel="next"/.test(responseHeaders.link ?? "") };
      },
    });
  } catch (error) {
    if (error instanceof CommitHistoryError) throw error;
    const { status, body } = getGitHubErrorResponse(error);
    throw new CommitHistoryError(status, (body.error ? body.code : undefined) ?? "GITHUB_COMMITS_UNAVAILABLE", body.message);
  }
};
