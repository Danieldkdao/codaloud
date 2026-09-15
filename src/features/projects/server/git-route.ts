import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { apiResponse, getContentType, isValidIds } from "@/lib/utils";
import type { ApiResponse } from "@/lib/types";
import { SandboxFilesError } from "@/services/daytona/api";
import { executeGitOperation } from "@/services/daytona/git-operation";
import { getUserReadyProject } from "./project-workspace";

const respond = <T>(body: ApiResponse<T>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING") response.headers.set("Retry-After", "3");
  return response;
};

export const createGitRoute = <I, O>(options: {
  input: z.ZodType<I>; output: z.ZodType<O>; script: string;
  message: string; mutation?: boolean; author?: boolean;
}) => async (request: Request, { projectId }: { projectId: string }) => {
  let started = false;
  try {
    const { userId, user } = await getCurrentUser(request.headers);
    if (!userId) return respond({ error: true, code: "UNAUTHENTICATED", message: "Sign in to use project Git." }, 401);
    if (!isValidIds(projectId)) return respond({ error: true, code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
    if (options.mutation && getContentType(request.headers) !== "application/json") {
      return respond({ error: true, code: "INVALID_CONTENT_TYPE", message: "Send an application/json request body." }, 415);
    }
    const query = new URL(request.url).searchParams;
    const raw = options.mutation ? await request.json().catch(() => null) : Object.fromEntries(query);
    const input = options.input.safeParse(raw);
    if (!input.success || (!options.mutation && new Set(query.keys()).size !== [...query.keys()].length)) {
      return respond({ error: true, code: "INVALID_GIT_INPUT", message: "Invalid Git parameters or unexpected fields." }, 400);
    }
    const existingProject = await getUserReadyProject(userId, projectId);
    let author;
    if (options.author) {
      const name = z.string().trim().min(1).max(500).regex(/^[^<>\x00-\x1f\x7f]+$/).safeParse(user?.name);
      const email = z.email().safeParse(user?.email);
      if (!name.success || !email.success) return respond({ error: true, code: "COMMIT_AUTHOR_REQUIRED", message: "Add a valid name and email to your account." }, 422);
      author = { name: name.data, email: email.data };
    }
    started = true;
    const data = await executeGitOperation({
      sandboxId: existingProject.sandboxId, projectId, script: options.script,
      input: { ...input.data as object, author }, output: options.output,
      signal: request.signal, mutation: options.mutation ?? false,
    });
    return respond({ error: false, message: options.message, data });
  } catch (error) {
    if (error instanceof SandboxFilesError) return respond({ error: true, code: error.code, message: error.message }, error.status);
    return respond({ error: true, code: started && options.mutation ? "GIT_OUTCOME_UNKNOWN" : "GIT_REQUEST_FAILED", message: "Unable to confirm the Git request. Refresh the workspace before retrying." }, 502);
  }
};
