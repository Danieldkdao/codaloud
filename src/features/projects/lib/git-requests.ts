import { z } from "zod";
import type { ApiResponse } from "@/lib/types";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import { createRequestHeaders, createSearchParams, fetchBase, isValidIds } from "@/lib/utils";

export const readProjectGitRequest = async <T>({
  projectId, path, output, signal, input, params,
}: {
  projectId: string;
  path: string;
  output: z.ZodType<T>;
  signal?: AbortSignal;
  input?: z.ZodType<Record<string, string | number | boolean | null | undefined>>;
  params?: unknown;
}): Promise<T | null> => {
  try {
    if (signal?.aborted) return null;
    const { userId, error } = await getCurrentUserClient();
    if (error || !userId || !isValidIds(projectId)) return null;
    const query = input ? createSearchParams(input.parse(params)) : null;
    const headers = await createRequestHeaders();
    if (!headers.get("Cookie")?.trim() || signal?.aborted) return null;

    const response = await fetchBase(`/api/projects/${projectId}/git/${path}${query ? `?${query}` : ""}`, {
      method: "GET", headers, credentials: "omit", signal,
    });
    if (!response.ok || signal?.aborted) return null;
    const payload: unknown = await response.json();
    if (signal?.aborted) return null;
    return z.object({ error: z.literal(false), message: z.string().min(1), data: output }).parse(payload).data;
  } catch {
    return null;
  }
};

export const mutateProjectGitRequest = async <I, O>({
  projectId, path, input, unsafeInput, output,
}: {
  projectId: string;
  path: string;
  input: z.ZodType<I>;
  unsafeInput: unknown;
  output: z.ZodType<O>;
}): Promise<ApiResponse<O>> => {
  const unconfirmed = {
    error: true as const,
    code: "GIT_OUTCOME_UNKNOWN",
    message: "Unable to confirm the Git request. Refresh the workspace before retrying.",
  };
  let requestStarted = false;
  try {
    const { userId, error } = await getCurrentUserClient();
    if (error)
      return { error: true, code: "SESSION_UNAVAILABLE", message: "Unable to verify your session. Please try again." };
    if (!userId)
      return { error: true, code: "UNAUTHENTICATED", message: "Sign in to use project Git." };
    if (!isValidIds(projectId))
      return { error: true, code: "INVALID_PROJECT", message: "Invalid project ID." };
    const parsed = input.safeParse(unsafeInput);
    if (!parsed.success)
      return { error: true, code: "INVALID_GIT_INPUT", message: "Invalid Git parameters or unexpected fields." };
    const headers = await createRequestHeaders({ "Content-Type": "application/json" });
    if (!headers.get("Cookie")?.trim())
      return { error: true, code: "UNAUTHENTICATED", message: "Sign in to use project Git." };

    const body = JSON.stringify(parsed.data);
    requestStarted = true;
    const response = await fetchBase(`/api/projects/${projectId}/git/${path}`, {
      method: "POST", headers, credentials: "omit", body,
    });
    const result = z.discriminatedUnion("error", [
      z.object({ error: z.literal(true), message: z.string().min(1), code: z.string().min(1).optional() }),
      z.object({ error: z.literal(false), message: z.string().min(1), data: output }),
    ]).parse(await response.json());
    if (result.error) return result;
    return response.ok ? result : unconfirmed;
  } catch {
    // A lost response may follow a completed mutation; leave reconciliation to the caller.
    if (requestStarted) return unconfirmed;
    return { error: true, code: "GIT_REQUEST_FAILED", message: "Unable to prepare the Git request. Please try again." };
  }
};
