import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publishProjectAction } from "../actions/publish-actions";
import type {
  ProjectPublishedSchema,
  PublishProjectSchema,
} from "../actions/publish-schemas";
import type { ProjectGitMutationContext } from "../types";
import { ProjectGitError, requireLocalGitProject } from "../lib/git-errors";
import { refreshProjectGitQueries } from "../lib/git-cache";

export const usePublishProject = (projectId: string | null | undefined) => {
  const client = useQueryClient();
  return useMutation<
    ProjectPublishedSchema,
    ProjectGitError,
    PublishProjectSchema,
    ProjectGitMutationContext
  >({
    mutationKey: ["projects", "git", "publish", projectId],
    retry: false,
    networkMode: "always",
    onMutate: () => ({ projectId }),
    mutationFn: async (input) => {
      const result = await publishProjectAction(
        requireLocalGitProject(projectId),
        input,
      );
      if (result.error) throw new ProjectGitError(result.message, result.code);
      return result.data;
    },
    onSettled: async (_data, _error, _input, context) => {
      // Creation, remote attachment, and push can succeed independently. Refresh
      // every affected surface even when the overall operation reports failure.
      await Promise.allSettled([
        refreshProjectGitQueries(client, context, { remote: true }),
        client.invalidateQueries({ queryKey: ["projects", "infinite"] }),
        client.resetQueries({ queryKey: ["github", "repositories"] }),
      ]);
    },
  });
};
