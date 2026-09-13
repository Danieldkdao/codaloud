import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { paginateGitHubSearch } from "@/services/github/server/search-pagination";
import {
  commitHashSchema,
  projectCommitPageSchema,
  projectCommitQuerySchema,
  type CommitSource,
  type ProjectCommitQuerySchema,
  type ProjectCommitSchema,
} from "../actions/commit-schemas";

export class CommitHistoryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommitHistoryError";
  }
}

export const parseCommitQuery = (projectId: string, input: unknown) => {
  const parsed = projectCommitQuerySchema.safeParse(input);
  if (!z.uuid().safeParse(projectId).success || !parsed.success) {
    throw new CommitHistoryError(
      400,
      "INVALID_COMMIT_PARAMS",
      "Invalid commit search or pagination.",
    );
  }
  return parsed.data;
};

const commitCursorSchema = z.strictObject({
  version: z.literal(1),
  scope: z.string().length(64),
  snapshotSha: commitHashSchema,
  position: z.string().min(1).max(2048),
  expiresAt: z.number().int().positive(),
});
export type CommitCursorSchema = z.infer<typeof commitCursorSchema>;

export const createCommitScope = (
  userId: string,
  projectId: string,
  source: CommitSource,
  providerId: string,
  query: ProjectCommitQuerySchema,
) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        projectId,
        source,
        providerId,
        query.branch,
        query.search,
        query.author,
        query.pageSize,
      ]),
    )
    .digest("hex");

const signCursor = (payload: string) =>
  createHmac("sha256", serverEnv.COMMIT_CURSOR_SIGNING_SECRET)
    .update("commit-history:")
    .update(payload)
    .digest("hex");

export const readCommitCursor = (
  cursor: string | null | undefined,
  scope: string,
): CommitCursorSchema | null => {
  if (!cursor) return null;
  try {
    const [payload, signature, extra] = cursor.split(".");
    if (
      extra ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[a-f0-9]{64}$/.test(signature ?? "") ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(signCursor(payload)))
    )
      throw new Error();
    const result = commitCursorSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (result.scope !== scope || result.expiresAt <= Date.now())
      throw new Error();
    return result;
  } catch {
    throw new CommitHistoryError(
      400,
      "INVALID_COMMIT_CURSOR",
      "This commit cursor is invalid or expired. Refresh the history.",
    );
  }
};

const writeCommitCursor = (cursor: CommitCursorSchema) => {
  const payload = Buffer.from(
    JSON.stringify(commitCursorSchema.parse(cursor)),
  ).toString("base64url");
  return `${payload}.${signCursor(payload)}`;
};

export const paginateCommitHistory = async ({
  query,
  scope,
  cursor,
  snapshotSha,
  isShallow = false,
  loadBatch,
  signal,
}: {
  query: ProjectCommitQuerySchema;
  scope: string;
  cursor: CommitCursorSchema | null;
  snapshotSha: string | null;
  isShallow?: boolean;
  loadBatch: (
    page: number,
    pageSize: number,
  ) => Promise<{ items: ProjectCommitSchema[]; hasNextPage: boolean }>;
  signal?: AbortSignal;
}) => {
  if (!snapshotSha)
    return projectCommitPageSchema.parse({
      commits: [],
      snapshotSha: null,
      nextCursor: null,
      isShallow,
    });
  // Reuse the bounded scanner and intra-page continuation already used by branches.
  // The hashed search marker fits its cursor; our predicate applies the actual filters.
  const result = await paginateGitHubSearch({
    loadBatch,
    signal,
    scope,
    pagination: {
      search: query.search || query.author ? scope : "",
      pageSize: query.pageSize,
      cursor: cursor?.position,
    },
    matchesSearch: (commit) => {
      const author = `${commit.author}\n${commit.authorEmail}`.toLowerCase();
      return (
        (!query.author || author.includes(query.author)) &&
        (!query.search ||
          [commit.message, author, commit.hash].some((value) =>
            value.toLowerCase().includes(query.search),
          ))
      );
    },
  });
  return projectCommitPageSchema.parse({
    commits: result.items,
    snapshotSha,
    isShallow,
    nextCursor: result.nextCursor
      ? writeCommitCursor({
          version: 1,
          scope,
          snapshotSha,
          position: result.nextCursor,
          expiresAt: cursor?.expiresAt ?? Date.now() + 60 * 60 * 1000,
        })
      : null,
  });
};
