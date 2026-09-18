import { isValidIds } from "@/lib/utils";
import type { GitPulledSchema } from "../server/git-pull-schemas";
import type { GitPushedSchema } from "../server/git-push-schemas";
import type { GitCountsSchema } from "../server/git-schemas";
import type { ProjectGitMutationContext } from "../types";
import { gitPullSchema } from "../server/git-pull-schemas";
import {
  pullProjectGitAction,
  pushProjectGitAction,
  fetchProjectGitAction,
  readProjectGitCountsAction,
} from "../actions/git-actions";
import { gitPushSchema } from "../server/git-push-schemas";
import { refreshProjectGitQueries } from "../lib/git-cache";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";
import {
  ProjectGitError,
  ProjectGitRequestError,
  requireLocalGitProject,
} from "../lib/git-errors";

export const useProjectGit = (
  projectId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  const { workspace } = useDeviceWorkspace();
  const userId = workspace?.ownerId ?? null;
  const validProject = !!projectId && isValidIds(projectId);
  const query = useQuery({
    networkMode: "always",
    queryKey: ["projects", "git-counts", userId, projectId],
    enabled: enabled && Boolean(userId) && validProject,
    // Post-mutation refreshes run together. Another Git status read can briefly
    // own the repository lock; retry this read so counts follow the new branch.
    retry: (failureCount, error) =>
      error instanceof ProjectGitRequestError &&
      ((error.status === 503 && error.code === "WORKSPACE_RESTORING") ||
        (failureCount < 2 &&
          (error.status === 0 || error.status >= 500 ||
            (error.status === 409 && error.code === "GIT_BUSY")))),
    retryDelay: (attempt, error) =>
      error instanceof ProjectGitRequestError
        ? error.retryAfterMs || Math.min(1000 * 2 ** attempt, 30_000)
        : 0,
    queryFn: async ({ signal }) => {
      const id = requireLocalGitProject(userId, projectId);
      let failure: ProjectGitRequestError | undefined;
      const counts = await readProjectGitCountsAction(
        id,
        signal,
        (status, retryAfter, code) => {
          failure = new ProjectGitRequestError(status, retryAfter, code);
        },
      );
      if (counts === null)
        throw (
          failure ?? new Error("Unable to load Git counts. Please try again.")
        );
      return counts;
    },
  });

  const gitFetch = useMutation<
    GitCountsSchema,
    ProjectGitError,
    void,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "fetch", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async () => {
      const id = requireLocalGitProject(userId, projectId);
      const result = await fetchProjectGitAction(id);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context, { remote: true }),
  });

  const gitPush = useMutation<
    GitPushedSchema,
    ProjectGitError,
    z.input<typeof gitPushSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "push", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: z.input<typeof gitPushSchema> = {}) => {
      const id = requireLocalGitProject(userId, projectId);
      const result = await pushProjectGitAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context, { remote: true }),
  });

  const gitPull = useMutation<
    GitPulledSchema,
    ProjectGitError,
    z.input<typeof gitPullSchema>,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "pull", userId, projectId],
    retry: false,
    // Execute now or fail; never replay a queued write against a later workspace.
    networkMode: "always",
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: z.input<typeof gitPullSchema> = {}) => {
      const id = requireLocalGitProject(userId, projectId);
      const result = await pullProjectGitAction(id, input);
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    // Conflicts and lost responses can leave partial changes on the server.
    onSettled: (_data, _error, _input, context) =>
      refreshProjectGitQueries(queryClient, context, { remote: true }),
  });

  return { ...query, gitFetch, gitPush, gitPull };
};
