import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readProjectGitCountsAction } from "../actions/git-actions";
import { ProjectGitRequestError, requireProjectGitSession } from "../lib/git-errors";

export const useProjectGit = (
  projectId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) => {
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

  return { ...query };
};
