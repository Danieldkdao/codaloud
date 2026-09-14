import {
  readProjectBranchesResponseSchema,
  type ProjectBranchPageSchema,
} from "./branch-schemas";
import { projectBranchParamsSchema, readProjectBranchCursor, type ProjectBranchParamsSchema } from "../lib/branch-params";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import { createRequestHeaders, createSearchParams, fetchBase, isValidIds } from "@/lib/utils";
import {
  readProjectChangesResponseSchema,
  type ProjectRepositoryChangesSchema,
} from "./change-schemas";
import {
  readProjectCommitsResponseSchema,
  type CommitSource,
  type ProjectCommitPageSchema,
  type ProjectCommitQueryInput,
} from "./commit-schemas";
import { projectCommitParamsSchema } from "../lib/commit-params";

export const readProjectChangesAction = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectRepositoryChangesSchema | null> => {
  try {
    if (signal?.aborted) return null;
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError || !userId || !isValidIds(projectId)) return null;

    const headers = await createRequestHeaders();
    if (!headers.get("Cookie")?.trim() || signal?.aborted) return null;

    const response = await fetchBase(`/api/projects/${projectId}/changes`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("Unable to load project changes.");
    if (signal?.aborted) return null;

    const payload: unknown = await response.json();
    if (signal?.aborted) return null;
    return readProjectChangesResponseSchema.parse(payload).data;
  } catch {
    return null;
  }
};

export const readProjectBranchesAction = async (
  projectId: string,
  params: Partial<Omit<ProjectBranchParamsSchema, "projectId">> = {},
  signal?: AbortSignal,
  onFailure?: (status: number, retryAfter: string | null, code?: string) => void,
): Promise<ProjectBranchPageSchema | null> => {
  try {
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError || !userId) return null;
    const input = projectBranchParamsSchema.safeParse({ ...params, projectId });
    if (!input.success) return null;

    const headers = await createRequestHeaders();
    if (!headers.has("Cookie")) return null;

    const { search, cursor, pageSize } = input.data;
    const query = createSearchParams({ search, cursor, pageSize });
    let response: Response;
    try {
      response = await fetchBase(`/api/projects/${projectId}/branches?${query}`, {
        method: "GET",
        headers,
        credentials: "omit",
        signal,
      });
    } catch (error) {
      if (!signal?.aborted && !(error instanceof Error && error.name === "AbortError")) {
        onFailure?.(0, null);
      }
      return null;
    }
    if (!response.ok) {
      // Keep the read action's data-or-null contract while allowing the query to
      // distinguish temporary outages/restoration from failures needing user action.
      const failure: unknown = await response.json().catch(() => null);
      const code = failure !== null && typeof failure === "object" && "code" in failure &&
        failure.code === "WORKSPACE_RESTORING" ? failure.code : undefined;
      onFailure?.(response.status, response.headers.get("Retry-After"), code);
      return null;
    }

    const payload: unknown = await response.json();
    const result = readProjectBranchesResponseSchema.safeParse(payload);
    if (!result.success) return null;
    const page = result.data.data;
    const position = cursor ? readProjectBranchCursor(cursor) : null;
    if (page.branches.length > pageSize || page.branches.some((branch, index) =>
      !branch.toLowerCase().includes(search) ||
      (position !== null && branch <= position.after) ||
      (index > 0 && branch <= page.branches[index - 1])
    )) return null;
    if (page.nextCursor !== null) {
      const next = readProjectBranchCursor(page.nextCursor);
      if (!next || next.projectId !== projectId || next.search !== search ||
        next.after !== page.branches[page.branches.length - 1]) return null;
    }
    return page;
  } catch {
    return null;
  }
};

export const readProjectCommitsAction = async (
  projectId: string,
  params: ProjectCommitQueryInput & { source: CommitSource },
  signal?: AbortSignal,
  onFailure?: (status: number, retryAfter: string | null, code?: string) => void,
): Promise<ProjectCommitPageSchema | null> => {
  try {
    if (signal?.aborted) return null;
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError || !userId) return null;
    const input = projectCommitParamsSchema.safeParse({ ...params, projectId });
    if (!input.success) return null;

    const headers = await createRequestHeaders();
    if (!headers.get("Cookie")?.trim() || signal?.aborted) return null;

    const { projectId: validatedProjectId, ...queryParams } = input.data;
    const query = createSearchParams(queryParams);
    let response: Response;
    try {
      // Provider credentials and project access are checked by the API route.
      response = await fetchBase(`/api/projects/${validatedProjectId}/commits?${query}`, {
        method: "GET",
        headers,
        credentials: "omit",
        signal,
      });
    } catch (error) {
      if (!signal?.aborted && !(error instanceof Error && error.name === "AbortError")) {
        onFailure?.(0, null);
      }
      return null;
    }
    if (signal?.aborted) return null;
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      if (signal?.aborted) return null;
      const code = failure !== null && typeof failure === "object" &&
        "error" in failure && failure.error === true &&
        "code" in failure && typeof failure.code === "string" ? failure.code : undefined;
      // Preserve status and cursor/restoration codes for the query's retry policy.
      onFailure?.(response.status, response.headers.get("Retry-After"), code);
      return null;
    }

    const payload: unknown = await response.json();
    if (signal?.aborted) return null;
    const result = readProjectCommitsResponseSchema.safeParse(payload);
    if (!result.success) return null;
    const page = result.data.data;
    if (page.commits.length > input.data.pageSize ||
      (page.nextCursor !== null && (!page.nextCursor || page.nextCursor === input.data.cursor)) ||
      (page.snapshotSha === null && (page.commits.length > 0 || page.nextCursor !== null))) return null;
    // Bounded searches can return no matches yet still have more history to scan.
    return page;
  } catch {
    return null;
  }
};
