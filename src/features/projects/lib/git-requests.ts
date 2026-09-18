import { z } from "zod";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import {
  createRequestHeaders,
  createSearchParams,
  fetchBase,
  isValidIds,
} from "@/lib/utils";
import type {
  ProjectGitMutationFailure,
  ProjectGitMutationResult,
  ProjectGitReadFailureHandler,
} from "../types";

export const readProjectGitRequest = async <I extends Record<string, string | number | boolean | null | undefined>, O>({
  projectId,
  path,
  output,
  signal,
  input,
  params = {},
  query,
  validate,
  onFailure,
}: {
  projectId: string;
  // Relative to /api/projects/:projectId; dynamic paths use validated input.
  path: string | ((input: I) => string);
  output: z.ZodType<O>;
  signal?: AbortSignal;
  input: z.ZodType<I>;
  params?: unknown;
  query?: (input: I) => Record<string, string | number | boolean | null | undefined>;
  validate?: (data: O, input: I) => boolean;
  onFailure?: ProjectGitReadFailureHandler;
}): Promise<O | null> => {
  try {
    if (signal?.aborted) return null;
    const { userId, error } = await getCurrentUserClient();
    if (error || !userId || !isValidIds(projectId)) return null;
    const parsed = input.parse(params);
    const queryParams = query ? query(parsed) : parsed;
    const search = Object.keys(queryParams).length ? createSearchParams(queryParams) : null;
    const endpoint = typeof path === "string" ? path : path(parsed);
    const headers = await createRequestHeaders();
    if (!headers.get("Cookie")?.trim() || signal?.aborted) return null;

    let response: Response;
    try {
      response = await fetchBase(
        `/api/projects/${projectId}/${endpoint}${search?.size ? `?${search}` : ""}`,
        { method: "GET", headers, credentials: "omit", signal },
      );
    } catch (error) {
      if (!signal?.aborted && !(error instanceof Error && error.name === "AbortError"))
        onFailure?.(0, null);
      return null;
    }
    if (signal?.aborted) return null;
    if (!response.ok) {
      // Query hooks need HTTP/cursor/restoration metadata while reads still return null.
      if (onFailure) {
        const failure: unknown = await response.json().catch(() => null);
        if (signal?.aborted) return null;
        const code = failure !== null && typeof failure === "object" &&
          "error" in failure && failure.error === true &&
          "code" in failure && typeof failure.code === "string" ? failure.code : undefined;
        onFailure(response.status, response.headers.get("Retry-After"), code);
      }
      return null;
    }
    const payload: unknown = await response.json();
    if (signal?.aborted) return null;
    const { data } = z.object({
      error: z.literal(false), message: z.string(), data: output,
    }).parse(payload);
    return !validate || validate(data, parsed) ? data : null;
  } catch {
    return null;
  }
};

export const mutateProjectGitRequest = async <I, O>({
  projectId,
  path,
  input,
  unsafeInput,
  output,
  validate,
  errors = {},
}: {
  projectId: string;
  path: string;
  input: z.ZodType<I>;
  unsafeInput: unknown;
  output: z.ZodType<O>;
  validate?: (data: O, input: I) => boolean;
  errors?: Partial<Record<
    "session" | "unauthenticated" | "project" | "input" | "preparation" | "unknownOutcome",
    ProjectGitMutationFailure
  >>;
}): Promise<ProjectGitMutationResult<O>> => {
  const unconfirmed = errors.unknownOutcome ?? {
    error: true as const,
    code: "GIT_OUTCOME_UNKNOWN",
    message: "Unable to confirm the Git request. Refresh the workspace before retrying.",
  };
  const unauthenticated = errors.unauthenticated ?? {
    error: true as const, code: "UNAUTHENTICATED", message: "Sign in to use project Git.",
  };
  let requestStarted = false;
  try {
    const { userId, error } = await getCurrentUserClient();
    if (error)
      return errors.session ?? {
        error: true, code: "SESSION_UNAVAILABLE", message: "Unable to verify your session. Please try again.",
      };
    if (!userId) return unauthenticated;
    if (!isValidIds(projectId))
      return errors.project ?? { error: true, code: "INVALID_PROJECT", message: "Invalid project ID." };
    const parsed = input.safeParse(unsafeInput);
    if (!parsed.success)
      return errors.input ?? { error: true, code: "INVALID_GIT_INPUT", message: "Invalid Git parameters or unexpected fields." };
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.get("Cookie")?.trim()) return unauthenticated;

    const body = JSON.stringify(parsed.data);
    requestStarted = true;
    const response = await fetchBase(`/api/projects/${projectId}/${path}`, {
      method: "POST", headers, credentials: "omit", body,
    });
    const result = z.discriminatedUnion("error", [
      z.object({ error: z.literal(true), message: z.string().min(1), code: z.string().min(1).optional() }),
      z.object({ error: z.literal(false), message: z.string().min(1), data: output }),
    ]).parse(await response.json());
    if (result.error) return result;
    if (!response.ok || (validate && !validate(result.data, parsed.data))) return unconfirmed;
    return result;
  } catch {
    // A lost response may follow a completed mutation; leave reconciliation to the caller.
    if (requestStarted) return unconfirmed;
    return errors.preparation ?? {
      error: true, code: "GIT_REQUEST_FAILED", message: "Unable to prepare the Git request. Please try again.",
    };
  }
};
