import { useQuery } from "@tanstack/react-query";

import { readProjectAction } from "@/features/projects/actions/actions";
import { useAuthSession } from "@/hooks/use-auth-session";

export const useProject = (projectId: string) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error
    ? session.data?.user.id ?? null
    : null;

  return useQuery({
    queryKey: ["projects", "detail", userId, projectId],
    enabled: Boolean(userId),
    // Read failures lose their HTTP status; let the user retry instead of retrying 4xx responses.
    retry: false,
    queryFn: async ({ signal }) => {
      if (!userId) throw new Error("You must be signed in to view a project.");

      const existingProject = await readProjectAction(projectId, signal);

      // Read actions return null on failure; queries must reject to expose an error.
      if (existingProject === null) throw new Error("Unable to load project. Please try again.");

      return existingProject;
    },
  });
};
