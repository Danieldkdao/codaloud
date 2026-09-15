import { RequestError } from "octokit";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { confirmUserProjectOwnership } from "@/features/projects/server/projects";
import {
  projectCommitDetailsParamsSchema,
  projectCommitDetailsSchema,
  type ProjectCommitFileSchema,
  type ProjectCommitFileStatus,
} from "@/features/projects/actions/commit-details-schemas";
import { commitHashSchema } from "@/features/projects/actions/commit-schemas";
import { projectCommitDetailsLimits } from "@/features/projects/constants";
import { validateProjectCommitDetails } from "@/features/projects/server/commit-details";
import { SandboxFilesError } from "@/services/daytona/api";
import { getGitHubCredentials, getGitHubErrorResponse } from "./access";
import {
  createGitHubClient,
  verifyGitHubRepositoryAccess,
} from "./repositories";

export const gitHubCommitFileStatuses = [
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
] as const;
export type GitHubCommitFileStatus = (typeof gitHubCommitFileStatuses)[number];
const gitHubCommitPersonSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});
export type GitHubCommitPersonSchema = z.infer<typeof gitHubCommitPersonSchema>;
const gitHubCommitDetailsPageSchema = z.object({
  sha: commitHashSchema,
  commit: z.object({
    message: z.string(),
    author: gitHubCommitPersonSchema.nullable(),
    committer: gitHubCommitPersonSchema.nullable(),
  }),
  parents: z.array(z.object({ sha: commitHashSchema })),
  files: z
    .array(
      z.object({
        filename: z.string(),
        previous_filename: z.string().optional(),
        status: z.enum(gitHubCommitFileStatuses),
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        patch: z.string().optional(),
      }),
    )
    .max(100),
});
export type GitHubCommitDetailsPageSchema = z.infer<
  typeof gitHubCommitDetailsPageSchema
>;

const normalizeGitHubCommitFileStatus = (
  status: GitHubCommitFileStatus,
): ProjectCommitFileStatus => {
  switch (status) {
    case "removed":
      return "deleted";
    case "changed":
      return "type-changed";
    case "added":
    case "modified":
    case "renamed":
    case "copied":
      return status;
  }
};

export const readGitHubCommitDetails = async (
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
      source: "remote",
    });
    if (!params.success)
      throw new SandboxFilesError(
        400,
        "INVALID_COMMIT_PARAMS",
        "Invalid project or commit SHA.",
      );
    const existingProject = await confirmUserProjectOwnership(
      userId,
      projectId,
    );
    if (!existingProject)
      throw new SandboxFilesError(
        404,
        "PROJECT_NOT_FOUND",
        "Project not found.",
      );
    if (existingProject.deletionRequested)
      throw new SandboxFilesError(
        409,
        "PROJECT_DELETING",
        "This project is being deleted.",
      );
    if (!existingProject.githubRepositoryId)
      throw new SandboxFilesError(
        409,
        "GITHUB_REPOSITORY_REQUIRED",
        "This project has no linked GitHub repository.",
      );
    const deadline = AbortSignal.timeout(30_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, deadline])
      : deadline;
    const { accessToken } = await getGitHubCredentials(headers);
    requestSignal.throwIfAborted();
    const repository = await verifyGitHubRepositoryAccess(
      accessToken,
      existingProject.githubRepositoryId,
      requestSignal,
    );
    const [owner, repo, extra] = repository.fullName.split("/");
    if (!owner || !repo || extra) throw new Error("Invalid repository name");
    const octokit = createGitHubClient(accessToken, requestSignal);
    const files: ProjectCommitFileSchema[] = [];
    let commit:
      z.infer<typeof projectCommitDetailsSchema>["commit"] | undefined;
    let metadata = "";
    let bytes = 0;
    for (let page = 1; page <= 30; page++) {
      requestSignal.throwIfAborted();
      const response = await octokit.rest.repos
        .getCommit({ owner, repo, ref: commitSha, page, per_page: 100 })
        .catch((error: unknown) => {
          if (error instanceof RequestError && error.status === 404)
            throw new SandboxFilesError(
              404,
              "COMMIT_NOT_FOUND",
              "This commit could not be found in the linked GitHub repository.",
            );
          throw error;
        });
      requestSignal.throwIfAborted();
      bytes += Buffer.byteLength(JSON.stringify(response.data));
      if (bytes > projectCommitDetailsLimits.maxResponseBytes)
        throw new SandboxFilesError(
          413,
          "COMMIT_DIFF_TOO_LARGE",
          "This commit is too large to load in one response.",
        );
      const data = gitHubCommitDetailsPageSchema.parse(response.data);
      if (data.sha !== commitSha) throw new Error("Commit identity changed");
      const parentHashes = data.parents.map((parent) => parent.sha);
      const current = projectCommitDetailsSchema.shape.commit.parse({
        hash: data.sha,
        message: data.commit.message,
        author: data.commit.author?.name ?? "Unknown author",
        authorEmail: data.commit.author?.email ?? "",
        authoredAt: data.commit.author?.date ?? data.commit.committer?.date,
        committer: data.commit.committer?.name ?? "Unknown committer",
        committerEmail: data.commit.committer?.email ?? "",
        committedAt: data.commit.committer?.date ?? data.commit.author?.date,
        parentHashes,
        isMerge: parentHashes.length > 1,
      });
      if (commit && JSON.stringify(current) !== metadata)
        throw new Error("Commit metadata changed across pages");
      commit = current;
      metadata = JSON.stringify(current);
      for (const file of data.files) {
        let diff: ProjectCommitFileSchema["diff"];
        if (file.patch === undefined) {
          // GitHub omits patches for several reasons; absence alone does not prove a file is binary.
          diff = {
            patch: null,
            additions: null,
            deletions: null,
            unavailableReason: "unsupported",
          };
        } else if (
          Buffer.byteLength(file.patch) >=
          projectCommitDetailsLimits.maxPatchBytes
        ) {
          diff = {
            patch: null,
            additions: null,
            deletions: null,
            unavailableReason: "too-large",
          };
        } else {
          const patch =
            file.patch && !file.patch.endsWith("\n")
              ? file.patch + "\n"
              : file.patch;
          diff = {
            patch,
            additions: file.additions,
            deletions: file.deletions,
            unavailableReason: null,
          };
        }
        files.push({
          path: file.filename,
          originalPath: file.previous_filename ?? null,
          status: normalizeGitHubCommitFileStatus(file.status),
          beforeMode: null,
          afterMode: null,
          diff,
        });
      }
      // GitHub caps the file list at 3,000. At that boundary completeness cannot
      // be established, even if the provider omits a continuation link.
      if (
        files.length >= 3000 ||
        (page === 30 && /;\s*rel="next"/.test(response.headers.link ?? ""))
      ) {
        throw new SandboxFilesError(
          413,
          "COMMIT_DIFF_TOO_LARGE",
          "GitHub cannot provide a complete file list for this commit here.",
        );
      }
      if (!/;\s*rel="next"/.test(response.headers.link ?? "")) break;
      if (!data.files.length) throw new Error("Empty continuation page");
    }
    if (!commit) throw new Error("Missing commit");
    const summary = {
      fileCount: files.length,
      additions: 0,
      deletions: 0,
      unavailableCount: 0,
    };
    for (const file of files) {
      if (file.diff.unavailableReason !== null) summary.unavailableCount++;
      else {
        summary.additions += file.diff.additions;
        summary.deletions += file.diff.deletions;
      }
    }
    return validateProjectCommitDetails(
      {
        source: "remote",
        commit,
        baseSha: commit.parentHashes[0] ?? null,
        files,
        summary,
        githubUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${commitSha}`,
      },
      params.data,
    );
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    const { status, body } = getGitHubErrorResponse(error);
    throw new SandboxFilesError(
      status,
      (body.error ? body.code : undefined) ?? "COMMIT_DETAILS_UNAVAILABLE",
      body.message,
    );
  }
};
