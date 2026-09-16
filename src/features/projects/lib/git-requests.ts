import { z } from "zod";
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
