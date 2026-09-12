import {
  readProjectBranchesResponseSchema,
  type ProjectBranchPageSchema,
} from "./branch-schemas";
import { projectBranchParamsSchema, readProjectBranchCursor, type ProjectBranchParamsSchema } from "../lib/branch-params";
import { getCurrentUserClient } from "@/lib/auth/client-helpers";
import { createRequestHeaders, createSearchParams, fetchBase } from "@/lib/utils";

export const readProjectBranchesAction = async (
  projectId: string,
  params: Partial<Omit<ProjectBranchParamsSchema, "projectId">> = {},
  signal?: AbortSignal,
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
    const response = await fetchBase(`/api/projects/${projectId}/branches?${query}`, {
      method: "GET",
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) return null;

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
