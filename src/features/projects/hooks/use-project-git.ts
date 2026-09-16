import { gitPushSchema } from "../server/git-push-schemas";
import { pushProjectGitAction } from "../actions/git-actions";
import { refreshProjectGitQueries } from "../lib/git-cache";
import { fetchProjectGitAction } from "../actions/git-actions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readProjectGitCountsAction } from "../actions/git-actions";
import { ProjectGitError, ProjectGitRequestError, requireProjectGitSession } from "../lib/git-errors";

export const useProjectGit = (
  projectId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const project = z.uuid().safeParse(projectId);
  const query = useQuery({
    queryKey: ["projects", "git-counts", userId, projectId],
    enabled: enabled && Boolean(userId) && project.success,
    retry: (failureCount, error) => error instanceof ProjectGitRequestError && (
      (error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
      (failureCount < 2 && (error.status === 0 || error.status >= 500))
    ),
    retryDelay: (attempt, error) => error instanceof ProjectGitRequestError
      ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000) : 0,
    queryFn: async ({ signal }) => {
      const id = requireProjectGitSession(userId, projectId);
      let failure: ProjectGitRequestError | undefined;
      const counts = await readProjectGitCountsAction(id, signal, (status, retryAfter, code) => {
        failure = new ProjectGitRequestError(status, retryAfter, code);
      });
      if (counts === null) throw failure ?? new Error("Unable to load Git counts. Please try again.");
      return counts;
    },
  });

  const fetch = useMutation({
    mutationKey: ["projects", "git", "fetch", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async () => {
      const id = requireProjectGitSession(userId, projectId);
      const result = await fetchProjectGitAction(id);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context, { remote: true }),
  });

  const push = useMutation({
    mutationKey: ["projects", "git", "push", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: z.input<typeof gitPushSchema> = {}) => {
      const id = requireProjectGitSession(userId, projectId);
      const result = await pushProjectGitAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context, { remote: true }),
  });

  return { push, fetch, ...query };
};
