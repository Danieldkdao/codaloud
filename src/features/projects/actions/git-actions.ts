import { gitDiscardPreviewSchema } from "../server/git-discard-schemas";
import { gitStashQuerySchema, gitStashListSchema, gitStashPushSchema, gitStashPushedSchema, gitStashPopSchema, gitStashPoppedSchema } from "../server/git-stash-schemas";
import { gitCreateBranchSchema, gitCreatedBranchSchema } from "../server/git-branch-schemas";
import { gitPullSchema, gitPulledSchema } from "../server/git-pull-schemas";
import { gitPushSchema, gitPushedSchema } from "../server/git-push-schemas";
import { z } from "zod";
import { mutateProjectGitRequest, readProjectGitRequest } from "../lib/git-requests";
import { gitCountsSchema } from "../server/git-schemas";
import {
  checkoutProjectBranchResponseSchema,
  checkoutProjectBranchSchema,
  readProjectBranchesResponseSchema,
  type CheckoutProjectBranchResponseSchema,
  type CheckoutProjectBranchSchema,
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
import {
  projectCommitDetailsParamsSchema,
  readProjectCommitDetailsResponseSchema,
  type ProjectCommitDetailsParamsSchema,
  type ProjectCommitDetailsSchema,
} from "./commit-details-schemas";
import {
  createProjectCommitResponseSchema,
  createProjectCommitSchema,
  type CreateProjectCommitResponseSchema,
  type CreateProjectCommitSchema,
} from "./create-commit-schemas";

export const readProjectGitCountsAction = async (projectId: string, signal?: AbortSignal) =>
  readProjectGitRequest({ projectId, path: "counts", output: gitCountsSchema, signal });

export const fetchProjectGitAction = async (projectId: string) =>
  mutateProjectGitRequest({
    projectId, path: "fetch", input: z.strictObject({}), unsafeInput: {}, output: gitCountsSchema,
  });

export const createProjectCommitAction = async (
  projectId: string,
  unsafeInput: CreateProjectCommitSchema,
): Promise<CreateProjectCommitResponseSchema> => {
  const unconfirmed = {
    error: true as const,
    code: "COMMIT_OUTCOME_UNKNOWN",
    message: "Unable to confirm the commit. Refresh commit history and Git changes before retrying; the commit may already exist.",
  };
  let requestStarted = false;

  try {
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError)
      return { error: true, code: "SESSION_UNAVAILABLE", message: "Unable to verify your session. Please try again." };
    if (!userId)
      return { error: true, code: "UNAUTHENTICATED", message: "Sign in to commit changes." };
    if (!isValidIds(projectId))
      return { error: true, code: "INVALID_PROJECT", message: "Invalid project ID." };
    const input = createProjectCommitSchema.safeParse(unsafeInput);
    if (!input.success)
      return { error: true, code: "INVALID_COMMIT_INPUT", message: "Send a nonempty commit message and a nonempty list of unique repository-relative paths, without extra fields." };

    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.get("Cookie")?.trim())
      return { error: true, code: "UNAUTHENTICATED", message: "Sign in to commit changes." };

    const body = JSON.stringify(input.data);
    requestStarted = true;
    const response = await fetchBase(`/api/projects/${projectId}/commits`, {
      method: "POST",
      headers,
      credentials: "omit",
      body,
    });
    const result = createProjectCommitResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok) return unconfirmed;
    return result;
  } catch {
    // A lost response can follow a successful commit; do not retry this request.
    if (requestStarted) return unconfirmed;
    return { error: true, code: "COMMIT_REQUEST_UNAVAILABLE", message: "Unable to prepare the commit request. Please try again." };
  }
};

export const checkoutProjectBranchAction = async (
  projectId: string,
  unsafeInput: CheckoutProjectBranchSchema,
): Promise<CheckoutProjectBranchResponseSchema> => {
  // A lost or invalid response does not prove that the sandbox stayed on its old branch.
  const unconfirmed = {
    error: true as const,
    code: "CHECKOUT_OUTCOME_UNKNOWN",
    message: "Unable to confirm the branch switch. Refresh the current branch and files before trying again.",
  };

  try {
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError)
      return { error: true, message: "Unable to verify your session. Please try again." };
    if (!userId)
      return { error: true, message: "Sign in to switch branches." };
    if (!isValidIds(projectId))
      return { error: true, message: "Invalid project ID." };
    const input = checkoutProjectBranchSchema.safeParse(unsafeInput);
    if (!input.success)
      return { error: true, message: "Send a valid branchName without checkout options or extra fields." };

    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.get("Cookie")?.trim())
      return { error: true, message: "Sign in to switch branches." };

    const response = await fetchBase(`/api/projects/${projectId}/checkout`, {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify(input.data),
    });
    const result = checkoutProjectBranchResponseSchema.parse(await response.json());
    if (result.error) return result;
    if (!response.ok || result.data.currentBranch !== input.data.branchName)
      return unconfirmed;
    return result;
  } catch {
    return unconfirmed;
  }
};

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

export const readProjectCommitDetailsAction = async (
  projectId: string,
  params: Omit<ProjectCommitDetailsParamsSchema, "projectId">,
  signal?: AbortSignal,
): Promise<ProjectCommitDetailsSchema | null> => {
  try {
    if (signal?.aborted) return null;
    const { userId, error: sessionError } = await getCurrentUserClient();
    if (sessionError || !userId) return null;
    const input = projectCommitDetailsParamsSchema.safeParse({ ...params, projectId });
    if (!input.success) return null;

    const headers = await createRequestHeaders();
    if (!headers.get("Cookie")?.trim() || signal?.aborted) return null;

    const { projectId: validatedProjectId, commitSha, source } = input.data;
    const query = createSearchParams({ source });
    const response = await fetchBase(`/api/projects/${validatedProjectId}/commit/${commitSha}?${query}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok || signal?.aborted) return null;

    const payload: unknown = await response.json();
    if (signal?.aborted) return null;
    const { data } = readProjectCommitDetailsResponseSchema.parse(payload);
    if (data.commit.hash !== commitSha || data.source !== source) return null;
    return data;
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

export const pushProjectGitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitPushSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId, path: "push", output: gitPushedSchema,
    input: gitPushSchema, unsafeInput,
  });

export const pullProjectGitAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitPullSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId, path: "pull", output: gitPulledSchema,
    input: gitPullSchema, unsafeInput,
  });

export const createProjectBranchAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitCreateBranchSchema>,
) =>
  mutateProjectGitRequest({
    projectId, path: "branches", output: gitCreatedBranchSchema,
    input: gitCreateBranchSchema, unsafeInput,
  });

export const readProjectStashesAction = async (
  projectId: string,
  params: z.input<typeof gitStashQuerySchema> = {},
  signal?: AbortSignal,
) =>
  readProjectGitRequest({
    projectId, path: "stash", output: gitStashListSchema,
    input: gitStashQuerySchema, params,
    signal,
  });

export const stashProjectChangesAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitStashPushSchema> = {},
) =>
  mutateProjectGitRequest({
    projectId, path: "stash", output: gitStashPushedSchema,
    input: gitStashPushSchema, unsafeInput,
  });

export const popProjectStashAction = async (
  projectId: string,
  unsafeInput: z.input<typeof gitStashPopSchema>,
) =>
  mutateProjectGitRequest({
    projectId, path: "stash-pop", output: gitStashPoppedSchema,
    input: gitStashPopSchema, unsafeInput,
  });

export const readProjectDiscardPreviewAction = async (
  projectId: string,
  signal?: AbortSignal,
) =>
  readProjectGitRequest({
    projectId, path: "discard", output: gitDiscardPreviewSchema,
    signal,
  });
