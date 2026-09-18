import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { apiResponse, getContentType, isValidIds } from "@/lib/utils";
import type { ApiResponse } from "@/lib/types";
import { SandboxFilesError } from "@/services/daytona/api";
import { executeGitOperation } from "@/services/daytona/git-operation";
import { CommitHistoryError } from "./commit-pagination";
import { readGitJson } from "./git-request";
import { getProjectGitRemote } from "./git-remote";
import { getUserReadyProject } from "./project-workspace";

type GitRouteParams = { projectId: string; [key: string]: string };
type GitRouteError = { code: string; message: string; status?: number };
type GitRouteContext<I> = {
  request: Request;
  params: GitRouteParams;
  userId: string;
  input: I;
};

type GitRouteOptions<I, O> = {
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  message: string;
  mutation?: boolean;
  maxBodyBytes?: number;
  query?: (query: URLSearchParams, params: GitRouteParams) => unknown;
  errors?: {
    input?: GitRouteError;
    unavailable?: GitRouteError;
    unknownOutcome?: GitRouteError;
  };
} & (
  | { script: string; author?: boolean; remote?: "read" | "write"; execute?: never }
  // Existing services own project/provider authorization and may perform several
  // commands or read GitHub without a ready sandbox. Do not preflight them locally.
  | { execute: (context: GitRouteContext<I>) => Promise<unknown>; script?: never; author?: never; remote?: never }
);

const respond = <T>(body: ApiResponse<T>, status = 200) => {
  const response = apiResponse(body, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (body.error && body.code === "WORKSPACE_RESTORING")
    response.headers.set("Retry-After", "3");
  return response;
};

const respondError = (error: GitRouteError, status: number) =>
  respond({ error: true, code: error.code, message: error.message }, error.status ?? status);

export const createGitRoute = <I, O>(options: GitRouteOptions<I, O>) =>
  async (request: Request, params: GitRouteParams) => {
    let started = false;
    try {
      const { projectId } = params;
      const { userId, user } = await getCurrentUser(request.headers);
      if (!userId)
        return respondError({ code: "UNAUTHENTICATED", message: "Sign in to use project Git." }, 401);
      if (!isValidIds(projectId))
        return respondError({ code: "INVALID_PROJECT", message: "Invalid project ID." }, 400);
      if (options.mutation && getContentType(request.headers) !== "application/json")
        return respondError({ code: "INVALID_CONTENT_TYPE", message: "Send an application/json request body." }, 415);

      const invalidInput = options.errors?.input ?? {
        code: "INVALID_GIT_INPUT", message: "Invalid Git parameters or unexpected fields.",
      };
      const query = new URL(request.url).searchParams;
      // Reject ambiguity before mapping queries, especially attempts to override
      // dynamic path parameters such as projectId or commitSha.
      if ((options.mutation && query.size > 0) ||
          new Set(query.keys()).size !== query.size ||
          [...query.keys()].some((key) => Object.hasOwn(params, key)))
        return respondError(invalidInput, 400);
      const raw = options.mutation
        ? await readGitJson(request, options.maxBodyBytes)
        : options.query ? options.query(query, params) : Object.fromEntries(query);
      const input = options.input.safeParse(raw);
      if (!input.success) return respondError(invalidInput, 400);

      let data: O;
      if (options.execute) {
        started = true;
        data = options.output.parse(await options.execute({ request, params, userId, input: input.data }));
      } else {
        const existingProject = await getUserReadyProject(userId, projectId);
        let author;
        if (options.author) {
          const name = z.string().trim().min(1).max(500).regex(/^[^<>\x00-\x1f\x7f]+$/).safeParse(user?.name);
          const email = z.email().safeParse(user?.email);
          if (!name.success || !email.success)
            return respondError({ code: "COMMIT_AUTHOR_REQUIRED", message: "Add a valid name and email to your account." }, 422);
          author = { name: name.data, email: email.data };
        }
        const remote = options.remote
          ? await getProjectGitRemote(request.headers, existingProject.githubRepositoryId, options.remote === "write", request.signal)
          : undefined;
        started = true;
        data = await executeGitOperation({
          sandboxId: existingProject.sandboxId, projectId, script: options.script,
          input: { ...(input.data as object), author, remote }, output: options.output,
          signal: request.signal, mutation: options.mutation ?? false,
        });
      }
      return respond({ error: false, message: options.message, data });
    } catch (error) {
      if (error instanceof SandboxFilesError || error instanceof CommitHistoryError)
        return respondError(error, error.status);
      const failure = started && options.mutation
        ? options.errors?.unknownOutcome ?? { code: "GIT_OUTCOME_UNKNOWN", message: "Unable to confirm the Git request. Refresh the workspace before retrying." }
        : options.errors?.unavailable ?? { code: "GIT_REQUEST_FAILED", message: "Unable to confirm the Git request. Refresh the workspace before retrying." };
      return respondError(failure, 502);
    }
  };
